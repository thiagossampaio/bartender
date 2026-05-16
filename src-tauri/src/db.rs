//! Persistência SQLite local (WP-02 / SPEC-02).
//!
//! Responsabilidades:
//! - Resolver o caminho do banco por SO
//!   (`%APPDATA%\Etiquetador\etiquetador.db` no Windows,
//!    `~/Library/Application Support/Etiquetador/etiquetador.db` no macOS).
//! - Garantir o diretório criado com permissões restritas ao usuário.
//! - Expor as migrations do `tauri-plugin-sql` (chamado em `lib.rs`).
//!
//! O frontend conversa com o banco via `@tauri-apps/plugin-sql`
//! (`Database.load("sqlite:etiquetador.db")`), que já oferece `execute` e
//! `select`. Os helpers `db_query` / `db_execute` previstos em SPEC-02 ficam
//! no lado JS (`src/lib/db.ts`) como façade tipada, evitando duplicar a
//! ponte no Rust enquanto não há lógica de negócio para auditar.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{Migration, MigrationKind};
use thiserror::Error;

/// Nome do arquivo do banco. Mantido aqui para reuso entre o builder do
/// plugin (que usa `sqlite:<filename>`) e a resolução de path absoluto
/// usada por permissões/diagnóstico.
pub const DB_FILENAME: &str = "etiquetador.db";

/// Identificador usado no plugin para abrir a conexão.
/// O frontend importa o mesmo valor via `Database.load(DB_URL)`.
pub const DB_URL: &str = "sqlite:etiquetador.db";

/// Migrations versionadas em ordem crescente. `tauri-plugin-sql` aplica só
/// as ainda não registradas em `_sqlx_migrations` (idempotência garantida
/// pelo próprio plugin via `sqlx::migrate!`).
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "templates_soft_delete",
            sql: include_str!("../migrations/002_soft_delete.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

/// Erros do módulo. Convertidos para string ao cruzar a fronteira Tauri.
#[derive(Debug, Error)]
pub enum DbError {
    #[error("não foi possível resolver o diretório de dados do app")]
    AppDataDirUnavailable,
    #[error("falha de IO em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

impl serde::Serialize for DbError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Diretório raiz dos dados do app (criado se necessário, com 0700 em Unix).
fn ensure_app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, DbError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DbError::AppDataDirUnavailable)?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|source| DbError::Io {
            path: dir.display().to_string(),
            source,
        })?;
    }
    restrict_permissions(&dir, 0o700)?;
    Ok(dir)
}

/// Caminho absoluto do arquivo `.db` no SO atual. Útil para diagnóstico
/// (mensagem de schema corrompido) e para reforçar permissões.
pub fn database_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, DbError> {
    Ok(ensure_app_data_dir(app)?.join(DB_FILENAME))
}

/// Aplica permissões restritas em Unix (0700 dir / 0600 arquivo).
/// No Windows os ACLs herdados de `%APPDATA%` já restringem ao usuário corrente.
#[cfg(unix)]
fn restrict_permissions(path: &std::path::Path, mode: u32) -> Result<(), DbError> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(mode);
    std::fs::set_permissions(path, perms).map_err(|source| DbError::Io {
        path: path.display().to_string(),
        source,
    })
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &std::path::Path, _mode: u32) -> Result<(), DbError> {
    // Windows: ACLs do diretório de roaming do usuário já restringem ao próprio.
    Ok(())
}

/// Hook chamado uma única vez no `setup` do `tauri::Builder`. Garante o
/// diretório e reforça permissões 0600 no `.db` quando o arquivo já existe.
pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<(), DbError> {
    let db_path = database_path(app)?;
    if db_path.exists() {
        restrict_permissions(&db_path, 0o600)?;
    }
    Ok(())
}

/// Retorna o caminho do banco como string (usado pelo comando `db_path`,
/// que o frontend pode exibir em diálogos de erro de schema corrompido).
#[tauri::command]
pub fn db_path<R: Runtime>(app: AppHandle<R>) -> Result<String, DbError> {
    Ok(database_path(&app)?.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_ordered_and_non_empty() {
        let m = migrations();
        assert_eq!(m.len(), 2, "WP-02 entrega migrations v1 e v2");
        assert_eq!(m[0].version, 1);
        assert_eq!(m[1].version, 2);
        assert!(!m[0].sql.is_empty());
        assert!(!m[1].sql.is_empty());
    }

    #[test]
    fn migration_v1_contains_required_tables() {
        let sql = migrations()[0].sql;
        for table in ["templates", "print_history", "printers", "settings"] {
            assert!(
                sql.contains(table),
                "migration v1 deve criar a tabela `{}`",
                table
            );
        }
        assert!(sql.contains("idx_templates_name"));
    }

    #[test]
    fn migration_v2_adds_deleted_at() {
        let sql = migrations()[1].sql;
        assert!(sql.contains("deleted_at"));
        assert!(sql.contains("ALTER TABLE templates"));
    }
}
