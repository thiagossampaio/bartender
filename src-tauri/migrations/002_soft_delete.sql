-- Migration v2 — coluna `deleted_at` em templates para suportar a lixeira
-- (mitigação R06; SPEC-02 §"Schema obrigatório" + SPEC-03).
--
-- SQLite < 3.35 não suporta `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, então
-- a idempotência depende do tracking do `tauri-plugin-sql` (`_sqlx_migrations`),
-- que só executa migrations ainda não aplicadas.

ALTER TABLE templates ADD COLUMN deleted_at TEXT NULL;

-- Atualiza o setting informativo de versão.
INSERT INTO settings (key, value) VALUES ('schema_version', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
