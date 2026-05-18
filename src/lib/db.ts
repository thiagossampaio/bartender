/**
 * Façade tipada do banco SQLite local (WP-02 / SPEC-02).
 *
 * O backend (Rust) registra a conexão `sqlite:bartender.db` no plugin
 * `tauri-plugin-sql` e aplica as migrations v1 (schema PRD §4.2) e v2
 * (`deleted_at` em `templates`) na inicialização. Este módulo expõe os
 * helpers `dbQuery` (SELECT) e `dbExecute` (INSERT/UPDATE/DELETE/DDL)
 * usados pelas próximas WPs (templates, history, printers, settings).
 *
 * As próximas WPs DEVEM usar este helper em vez de chamar o plugin
 * diretamente — assim conseguimos adicionar logging/auditoria sem
 * mexer em cada call-site.
 */

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

/**
 * Identificador da conexão. Deve ser o mesmo string usado pelo backend
 * em `tauri_plugin_sql::Builder::add_migrations(DB_URL, ...)`.
 */
export const DB_URL = "sqlite:bartender.db";

let cachedDb: Database | null = null;

/**
 * Retorna (e memoriza) a conexão com o banco. A primeira chamada dispara
 * o `Database.load(...)` do plugin, que abre o pool sqlx e roda migrations
 * pendentes (idempotente — só aplica as que ainda não estão em
 * `_sqlx_migrations`).
 */
export async function getDatabase(): Promise<Database> {
  if (!cachedDb) {
    cachedDb = await Database.load(DB_URL);
  }
  return cachedDb;
}

/**
 * Executa um SELECT genérico e retorna as linhas tipadas.
 *
 * @param sql SQL com placeholders `$1`, `$2`, ...
 * @param params bind values (mesma ordem dos placeholders).
 */
export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDatabase();
  return db.select<T[]>(sql, params);
}

/**
 * Resposta de `dbExecute` (espelha `QueryResult` do plugin com naming
 * preferido nas próximas WPs).
 */
export interface ExecuteResult {
  /** Linhas afetadas pelo statement. */
  rowsAffected: number;
  /** ID do último INSERT, quando aplicável. */
  lastInsertId?: number;
}

/**
 * Executa um statement que não retorna linhas (INSERT/UPDATE/DELETE/DDL).
 */
export async function dbExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  const db = await getDatabase();
  const result = await db.execute(sql, params);
  return {
    rowsAffected: result.rowsAffected,
    lastInsertId: result.lastInsertId,
  };
}

/**
 * Caminho absoluto do arquivo `.db` no SO atual. Útil para mensagens de
 * erro de schema corrompido (SPEC-02 §"Comportamento esperado" item 4).
 */
export async function dbPath(): Promise<string> {
  return invoke<string>("db_path");
}

/**
 * Setting auxiliar — leitura tipada de `settings.value` por chave.
 * Retorna `null` se a chave não existir.
 */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await dbQuery<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows.length > 0 ? rows[0].value : null;
}

/**
 * Setting auxiliar — escrita tipada (upsert).
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await dbExecute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
