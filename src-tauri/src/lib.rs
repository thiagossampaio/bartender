// Bootstrap WP-01. Plugins de SQL/impressoras/PDF entram nas próximas WPs.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Comando trivial usado pelo placeholder para verificar a ponte JS↔Rust.
#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
