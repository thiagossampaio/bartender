-- Migration v1 — schema inicial reproduzido fiel ao PRD §4.2 / SPEC-02.
--
-- Idempotência: todas as criações usam IF NOT EXISTS para que rodar a migration
-- duas vezes (em modo dev ou se o tracking interno divergir) não falhe.

CREATE TABLE IF NOT EXISTS templates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    description      TEXT,
    width_mm         REAL    NOT NULL,
    height_mm        REAL    NOT NULL,
    -- Argox OS-214 Plus = 203 dpi; impressoras Zebra variam (203/300).
    dpi              INTEGER NOT NULL DEFAULT 203,
    -- 'portrait' | 'landscape'
    orientation      TEXT    NOT NULL DEFAULT 'portrait',
    background_color TEXT    DEFAULT '#FFFFFF',
    canvas_json      TEXT    NOT NULL,
    thumbnail_png    BLOB,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    version          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);

CREATE TABLE IF NOT EXISTS print_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   INTEGER NOT NULL,
    printer_name  TEXT    NOT NULL,
    -- 'driver' | 'raw_pplb' | 'raw_zpl'
    mode          TEXT    NOT NULL,
    quantity      INTEGER NOT NULL,
    -- 'manual' | 'csv' | 'xlsx'
    data_source   TEXT,
    source_path   TEXT,
    printed_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (template_id) REFERENCES templates(id)
);

CREATE TABLE IF NOT EXISTS printers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    system_name   TEXT    NOT NULL UNIQUE,
    friendly_name TEXT,
    -- Ex.: 'Argox OS-214 Plus', 'Zebra ZD220'
    model         TEXT,
    -- 'PPLB' | 'PPLA' | 'ZPL' | 'DRIVER'
    language      TEXT,
    default_dpi   INTEGER DEFAULT 203,
    is_default    INTEGER NOT NULL DEFAULT 0,
    last_used_at  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Setting interno usado para diagnóstico/telemetria local. O número
-- aqui é informativo; o controle real de versão é feito pelo tracking
-- do `tauri-plugin-sql` (`_sqlx_migrations`).
INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', '1');
