//! Logging estruturado com rotação (WP-16 / SPEC-13).
//!
//! Responsabilidades:
//! - Inicializar um logger global `tracing` no `setup()` do Tauri, gravando em
//!   arquivo rotativo por dia.
//! - Aplicar política de retenção: descartar logs com mais de 7 dias ou quando
//!   o total exceder 10 MB (o que vier antes), conforme PRD §6.2.
//! - Registrar um panic hook que escreve o panic no log (e o stderr padrão),
//!   garantindo que crashes do Rust nunca sumam silenciosamente — SPEC-13
//!   §"Regras de negócio" exige "DEVE logar todos os erros não tratados".
//! - Expor comandos para o frontend:
//!     * `logs_dir`        → caminho absoluto da pasta de logs (diagnóstico).
//!     * `log_event`       → ponte de logs do frontend para o arquivo.
//!
//! ## Paths por SO (SPEC-13 §"Comportamento esperado" item 3)
//!
//! - **macOS:**   `~/Library/Logs/Bartender/`
//! - **Windows:** `%LOCALAPPDATA%\Bartender\logs\`
//! - **Linux:**   `$XDG_STATE_HOME/Bartender/logs/` (`~/.local/state/...`)
//!
//! Em macOS o `app.path().app_log_dir()` já devolve `~/Library/Logs/<identifier>`.
//! Usamos isso para evitar inconsistência com o Tauri runtime; o nome de pasta
//! "Bartender" no caminho do Windows fica garantido pelo `identifier` do
//! `tauri.conf.json` (que casa com o `productName` no fim do caminho).
//!
//! ## Decisões registradas em MEMORY.md
//!
//! - **`tracing` em vez de `log`+`simplelog`:** já mantemos `tauri-plugin-sql`
//!   que internamente puxa `sqlx`, que puxa `tracing`. Aproveitar o ecossistema
//!   já presente em runtime evita duplicar dependência.
//! - **Rotação manual de antigos:** `tracing-appender` rotaciona diariamente
//!   mas não apaga arquivos velhos. Implementamos um GC simples ao iniciar
//!   que percorre a pasta, ordena por mtime e descarta os que excedem
//!   `MAX_AGE_DAYS` (7) ou `MAX_TOTAL_BYTES` (10 MiB).
//! - **Panic hook escreve via `tracing::error!`:** o subscriber está vivo até
//!   o processo abortar; mensagens em `panic` ainda batem o `WorkerGuard` do
//!   appender porque o guard só descarta no Drop final do binário.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::SystemTime;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling;
use tracing_subscriber::EnvFilter;

/// Retenção máxima de arquivos individuais (dias).
const MAX_AGE_DAYS: u64 = 7;

/// Teto agregado da pasta de logs (10 MiB), independente da idade. Recomendação
/// de SPEC-13 §"Regras de negócio".
const MAX_TOTAL_BYTES: u64 = 10 * 1024 * 1024;

/// Prefixo dos arquivos rotacionados. `tracing-appender` adiciona a data ao
/// fim (`bartender.log.2026-05-15`), o que mantém o GC trivial — basta
/// filtrar arquivos começando com este prefixo.
const LOG_FILE_PREFIX: &str = "bartender.log";

/// Guard do `non_blocking` writer. Tem que viver pelo tempo todo do processo;
/// se for dropado, o thread de flush é desligado. Armazenado em estático para
/// sobreviver ao fim do `setup()`.
static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Caminho absoluto da pasta de logs, resolvido uma vez no `setup()` e
/// reutilizado pelos comandos.
static LOGS_DIR: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Error)]
pub enum LogsError {
    #[error("não foi possível resolver o diretório de logs do app")]
    LogsDirUnavailable,
    #[error("falha de IO em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("nível de log inválido (esperado: error|warn|info|debug|trace)")]
    InvalidLevel,
}

impl Serialize for LogsError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Resolve e cria a pasta de logs por SO. Em todos os SOs reutilizamos a
/// função canônica do Tauri (`app_log_dir`), que respeita as convenções de
/// cada plataforma (Library/Logs no macOS, LocalAppData no Windows, ...).
fn ensure_logs_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, LogsError> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|_| LogsError::LogsDirUnavailable)?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|source| LogsError::Io {
            path: dir.display().to_string(),
            source,
        })?;
    }
    Ok(dir)
}

/// Hook chamado uma vez no `setup()` do Tauri. Cria a pasta, instala o
/// subscriber global, roda o GC inicial e registra o panic hook.
///
/// Se algo falhar aqui, o app continua — logging é defesa em profundidade,
/// não regra de negócio. O `eprintln!` continua imprimindo no console em
/// builds dev.
pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<(), LogsError> {
    let dir = ensure_logs_dir(app)?;

    // GC antes de abrir o appender — assim o arquivo do dia atual não corre
    // risco de ser apagado por idade (ele acabou de ser tocado).
    let _ = run_retention_gc(&dir);

    // Appender: 1 arquivo por dia, prefixo estável. O sufixo de data é
    // adicionado pelo próprio appender e fica `bartender.log.YYYY-MM-DD`.
    let appender = rolling::daily(&dir, LOG_FILE_PREFIX);
    let (writer, guard) = tracing_appender::non_blocking(appender);
    // Guarda viva: se outra inicialização correr aqui (testes), o set_err
    // é silencioso e mantemos a primeira.
    let _ = LOG_GUARD.set(guard);

    // Subscriber só pode ser instalado uma vez no processo. `try_init` evita
    // panic quando outro caller (sqlx, hot reload) já instalou — mantemos o
    // primeiro vencedor.
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .with_target(true)
        .with_env_filter(filter)
        .try_init();

    let _ = LOGS_DIR.set(dir.clone());

    install_panic_hook();

    tracing::info!(target: "bartender", "logger inicializado (dir={})", dir.display());
    Ok(())
}

/// Instala um hook global que despeja o panic no log antes de propagar para
/// o stderr padrão. Encadeia com o hook anterior para não engolir o backtrace
/// do Rust dev.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&'static str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<payload não-string>".into());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<sem localização>".into());
        tracing::error!(
            target: "bartender::panic",
            "PANIC em {location}: {payload}"
        );
        previous(info);
    }));
}

/// Apaga arquivos de log mais antigos que `MAX_AGE_DAYS` OU que excedam o
/// teto agregado `MAX_TOTAL_BYTES`. Mantém sempre os mais recentes.
fn run_retention_gc(dir: &Path) -> Result<(), std::io::Error> {
    let now = SystemTime::now();
    let max_age = std::time::Duration::from_secs(MAX_AGE_DAYS * 24 * 3600);

    // Lista todos os candidatos com seu tamanho e mtime.
    let mut entries: Vec<(PathBuf, u64, SystemTime)> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // Restringimos o GC ao nosso próprio prefixo — não tocamos arquivos
        // estranhos que o usuário possa colocar nessa pasta.
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !name.starts_with(LOG_FILE_PREFIX) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime = meta.modified().unwrap_or(now);
        entries.push((path, meta.len(), mtime));
    }

    // 1) Apaga por idade.
    entries.retain(|(path, _, mtime)| {
        let too_old = now.duration_since(*mtime).map(|d| d > max_age).unwrap_or(false);
        if too_old {
            let _ = std::fs::remove_file(path);
            false
        } else {
            true
        }
    });

    // 2) Apaga os mais antigos até cair sob o teto agregado.
    entries.sort_by_key(|(_, _, mtime)| *mtime); // ascendente (mais antigo primeiro)
    let mut total: u64 = entries.iter().map(|(_, size, _)| *size).sum();
    while total > MAX_TOTAL_BYTES {
        match entries.first() {
            Some((path, size, _)) => {
                let _ = std::fs::remove_file(path);
                total = total.saturating_sub(*size);
                entries.remove(0);
            }
            None => break,
        }
    }
    Ok(())
}

/// Comando: caminho absoluto da pasta de logs. Útil para o diálogo de erro
/// não tratado (botão "Copiar detalhes técnicos" referencia onde ver o stack).
#[tauri::command]
pub fn logs_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, LogsError> {
    if let Some(p) = LOGS_DIR.get() {
        return Ok(p.display().to_string());
    }
    // Fallback (testes / inicialização parcial): tenta resolver de novo.
    let p = ensure_logs_dir(&app)?;
    Ok(p.display().to_string())
}

/// Comando: o frontend chama isto para registrar um evento no arquivo de log.
/// Mantemos uma API mínima — nível + mensagem + opcional `target` (módulo
/// lógico, ex.: "frontend::editor::autosave").
#[tauri::command]
pub fn log_event(level: String, message: String, target: Option<String>) -> Result<(), LogsError> {
    let lvl = match level.to_ascii_lowercase().as_str() {
        "error" => tracing::Level::ERROR,
        "warn" | "warning" => tracing::Level::WARN,
        "info" => tracing::Level::INFO,
        "debug" => tracing::Level::DEBUG,
        "trace" => tracing::Level::TRACE,
        _ => return Err(LogsError::InvalidLevel),
    };
    let scope = target.as_deref().unwrap_or("frontend");
    // `tracing::event!` exige nível compile-time — destrinchamos o `match`.
    // O `target:` da macro é a categoria do subscriber (sempre "frontend");
    // o campo `scope` carrega o sub-módulo lógico do frontend que emitiu.
    match lvl {
        tracing::Level::ERROR => tracing::event!(target: "frontend", tracing::Level::ERROR, scope, "{}", message),
        tracing::Level::WARN => tracing::event!(target: "frontend", tracing::Level::WARN, scope, "{}", message),
        tracing::Level::INFO => tracing::event!(target: "frontend", tracing::Level::INFO, scope, "{}", message),
        tracing::Level::DEBUG => tracing::event!(target: "frontend", tracing::Level::DEBUG, scope, "{}", message),
        tracing::Level::TRACE => tracing::event!(target: "frontend", tracing::Level::TRACE, scope, "{}", message),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    #[test]
    fn rejects_invalid_level() {
        let err = log_event("emergency".into(), "msg".into(), None).unwrap_err();
        assert!(matches!(err, LogsError::InvalidLevel));
    }

    #[test]
    fn retention_ignores_foreign_files() {
        // Garantia: arquivos fora do prefixo `bartender.log` nunca são
        // tocados pelo GC — não queremos apagar nada que o usuário tenha
        // deixado na pasta de logs por engano.
        let tmp = std::env::temp_dir().join(format!(
            "bartender-logs-test-foreign-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        let foreign = tmp.join("README.txt");
        File::create(&foreign).unwrap().write_all(b"keep me").unwrap();
        let own = tmp.join("bartender.log.2026-05-15");
        File::create(&own).unwrap().write_all(b"ours").unwrap();

        run_retention_gc(&tmp).unwrap();
        assert!(foreign.exists(), "GC não deve apagar arquivos fora do prefixo");
        assert!(own.exists(), "arquivo recente nosso deve permanecer");
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn retention_caps_total_size() {
        let tmp = std::env::temp_dir().join(format!(
            "bartender-logs-test-size-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        // 3 arquivos de 5 MiB cada — total 15 MiB > 10 MiB teto.
        let big = vec![0u8; 5 * 1024 * 1024];
        for day in 10..13 {
            let p = tmp.join(format!("bartender.log.2026-05-{day:02}"));
            File::create(&p).unwrap().write_all(&big).unwrap();
        }

        run_retention_gc(&tmp).unwrap();

        let remaining: u64 = fs::read_dir(&tmp)
            .unwrap()
            .filter_map(|r| r.ok())
            .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
            .sum();
        assert!(
            remaining <= MAX_TOTAL_BYTES,
            "GC deve manter o agregado ≤ 10 MiB; ficou {remaining}"
        );
        let _ = fs::remove_dir_all(&tmp);
    }
}
