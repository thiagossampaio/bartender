// Bootstrap WP-01 + persistência SQLite WP-02 + fontes WP-06 + PDF WP-08 +
// detecção/impressão via driver do SO WP-09 + geração/envio PPLB WP-10 +
// geração/envio ZPL WP-11 + leitura de fontes de dados CSV/XLSX WP-12 +
// Import/Export `.etlbl` WP-14 + histórico/calibração/teste de impressora WP-15 +
// autosave / recovery / logs / panic hook WP-16.

mod autosave;
mod data_source;
mod db;
mod etlbl;
mod fonts;
mod logs;
mod pdf;
mod pplb;
mod printers;
mod zpl;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // SQLite local (SPEC-02). As migrations são aplicadas pelo próprio plugin
        // via `sqlx::migrate!`, idempotentes (apenas as não registradas em
        // `_sqlx_migrations` rodam).
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .setup(|app| {
            // Garante o diretório de dados do app + permissões restritas
            // (0700 em Unix). Falha aqui é fatal: sem path do banco o app
            // não tem como persistir nada.
            db::initialize(app.handle()).map_err(|e| -> Box<dyn std::error::Error + Send + Sync> {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            })?;
            // Logging com rotação + panic hook (WP-16 / SPEC-13). Tratamos
            // erro como warning — logging é defesa em profundidade; um app
            // sem log ainda funciona, só perde diagnóstico.
            if let Err(err) = logs::initialize(app.handle()) {
                eprintln!("[warn] não foi possível iniciar logger: {err}");
            }
            // Diretório de autosave em `<cache>/autosave/`. Idem: warning,
            // não fatal.
            if let Err(err) = autosave::initialize(app.handle()) {
                eprintln!("[warn] não foi possível iniciar autosave: {err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            autosave::autosave_clear,
            autosave::autosave_dir,
            autosave::autosave_load,
            autosave::autosave_save,
            data_source::data_source_read,
            data_source::path_exists,
            db::db_path,
            etlbl::etlbl_export,
            etlbl::etlbl_inspect,
            fonts::fonts_list_system,
            logs::log_event,
            logs::logs_dir,
            pdf::pdf_export,
            pdf::pdf_export_bytes,
            pplb::pplb_generate,
            printers::printer_calibrate,
            printers::printer_test_page,
            printers::printers_list,
            printers::printers_get_status,
            printers::printers_print_raster,
            printers::printers_print_raw,
            zpl::zpl_generate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Comando trivial usado pelo placeholder para verificar a ponte JS↔Rust.
#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
