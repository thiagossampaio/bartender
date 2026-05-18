//! Autosave de templates do editor (WP-16 / SPEC-13).
//!
//! Responsabilidades:
//! - Persistir um snapshot do `canvas_json` em edição a cada 30 s (timer no
//!   frontend), em `<cache>/Bartender/autosave/autosave_<id>.json`.
//! - Devolver o conteúdo e o `mtime` (em milissegundos desde a época) para o
//!   frontend comparar contra `templates.updated_at` na abertura do editor
//!   (RF de recovery, SPEC-13 §"Comportamento esperado" item 2).
//! - Apagar o snapshot quando o usuário salva com sucesso (ou descarta o
//!   recovery).
//!
//! ## Por que aqui e não no SQLite?
//!
//! O snapshot é volátil (descartado após save) e independente do banco —
//! manter em arquivo no diretório de cache:
//!  1. **Isola write contention:** autosave a cada 30 s não competiria com
//!     a transação principal do `templates`.
//!  2. **Sobrevive a corrupção do `.db`:** se a base falhar, o usuário ainda
//!     consegue recuperar o trabalho com o arquivo intacto.
//!  3. **Limpa em sistema:** o `<cache>` é a localização canônica para dados
//!     descartáveis no macOS/Win/Linux.
//!
//! ## Sanitização do ID
//!
//! Recebemos `template_id: i64` (vem do INTEGER do SQLite). Validamos `> 0`
//! e usamos `format!("autosave_{}.json")` — não há path traversal possível,
//! mas mantemos a verificação para falhar cedo se um caller fornecer 0/neg.

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

/// Subpasta dentro do `<cache>` do app.
const AUTOSAVE_DIR_NAME: &str = "autosave";

/// Limite de tamanho do snapshot. Templates típicos têm < 200 KB; um teto de
/// 8 MB cobre uso extremo com várias imagens grandes embarcadas, sem permitir
/// que um caller malicioso encha o cache.
const MAX_SNAPSHOT_BYTES: usize = 8 * 1024 * 1024;

/// Cache do diretório de autosave (criado uma vez em `initialize()`).
static AUTOSAVE_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Error)]
pub enum AutosaveError {
    #[error("template_id inválido")]
    InvalidId,
    #[error("conteúdo do autosave excedeu {0} bytes")]
    TooLarge(usize),
    #[error("não foi possível resolver o diretório de cache do app")]
    CacheDirUnavailable,
    #[error("falha de IO em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

impl Serialize for AutosaveError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Estrutura devolvida por `autosave_load` para o frontend decidir o recovery.
#[derive(Debug, Serialize)]
pub struct AutosaveSnapshot {
    /// String JSON crua do template — o frontend deserializa com `jsonToCanvas`.
    pub json: String,
    /// Modificação em ms desde a época (UTC). Comparável com a coluna
    /// `templates.updated_at` (que vem em "YYYY-MM-DD HH:MM:SS" UTC).
    pub mtime_ms: i64,
}

fn ensure_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AutosaveError> {
    if let Some(p) = AUTOSAVE_DIR.get() {
        return Ok(p.clone());
    }
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|_| AutosaveError::CacheDirUnavailable)?;
    let dir = cache.join(AUTOSAVE_DIR_NAME);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|source| AutosaveError::Io {
            path: dir.display().to_string(),
            source,
        })?;
    }
    let _ = AUTOSAVE_DIR.set(dir.clone());
    Ok(dir)
}

fn file_path(dir: &PathBuf, id: i64) -> PathBuf {
    dir.join(format!("autosave_{id}.json"))
}

/// Inicializa o diretório de autosave (chamado uma vez em `lib.rs::setup`).
pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<(), AutosaveError> {
    let _ = ensure_dir(app)?;
    Ok(())
}

#[tauri::command]
pub fn autosave_save<R: Runtime>(
    app: AppHandle<R>,
    template_id: i64,
    canvas_json: String,
) -> Result<(), AutosaveError> {
    if template_id <= 0 {
        return Err(AutosaveError::InvalidId);
    }
    if canvas_json.len() > MAX_SNAPSHOT_BYTES {
        return Err(AutosaveError::TooLarge(MAX_SNAPSHOT_BYTES));
    }
    let dir = ensure_dir(&app)?;
    let path = file_path(&dir, template_id);

    // Escrita atômica: grava em `.tmp` e renomeia. Evita arquivo parcial
    // quando o app é morto no meio do write — recovery sempre encontra um
    // snapshot válido ou nada.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, canvas_json.as_bytes()).map_err(|source| AutosaveError::Io {
        path: tmp.display().to_string(),
        source,
    })?;
    std::fs::rename(&tmp, &path).map_err(|source| AutosaveError::Io {
        path: path.display().to_string(),
        source,
    })?;
    Ok(())
}

#[tauri::command]
pub fn autosave_load<R: Runtime>(
    app: AppHandle<R>,
    template_id: i64,
) -> Result<Option<AutosaveSnapshot>, AutosaveError> {
    if template_id <= 0 {
        return Err(AutosaveError::InvalidId);
    }
    let dir = ensure_dir(&app)?;
    let path = file_path(&dir, template_id);
    if !path.exists() {
        return Ok(None);
    }
    let meta = std::fs::metadata(&path).map_err(|source| AutosaveError::Io {
        path: path.display().to_string(),
        source,
    })?;
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let json = std::fs::read_to_string(&path).map_err(|source| AutosaveError::Io {
        path: path.display().to_string(),
        source,
    })?;
    Ok(Some(AutosaveSnapshot { json, mtime_ms }))
}

#[tauri::command]
pub fn autosave_clear<R: Runtime>(
    app: AppHandle<R>,
    template_id: i64,
) -> Result<(), AutosaveError> {
    if template_id <= 0 {
        return Err(AutosaveError::InvalidId);
    }
    let dir = ensure_dir(&app)?;
    let path = file_path(&dir, template_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|source| AutosaveError::Io {
            path: path.display().to_string(),
            source,
        })?;
    }
    Ok(())
}

/// Comando utilitário: caminho absoluto da pasta de autosave (diagnóstico).
#[tauri::command]
pub fn autosave_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, AutosaveError> {
    let dir = ensure_dir(&app)?;
    Ok(dir.display().to_string())
}

// Helper exposto para os testes — `SystemTime::now` real é difícil de
// controlar, mas o tipo `AutosaveSnapshot` é fácil de validar via round-trip.
#[allow(dead_code)]
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_path_format_is_deterministic() {
        let dir = PathBuf::from("/tmp/foo");
        let p = file_path(&dir, 42);
        assert!(p.to_string_lossy().ends_with("autosave_42.json"));
    }

    #[test]
    fn snapshot_serializes_with_snake_case_mtime() {
        // O frontend lê `raw.mtime_ms` — qualquer renomeação aqui (sem
        // `#[serde(rename = ...)]`) quebraria a recuperação silenciosamente.
        let snap = AutosaveSnapshot {
            json: "{}".into(),
            mtime_ms: 123_456,
        };
        let out = serde_json::to_string(&snap).unwrap();
        assert!(out.contains("\"mtime_ms\":123456"));
        assert!(out.contains("\"json\":\"{}\""));
    }
}
