pub mod commands;
pub mod error;
pub mod pdf;

use commands::files::{
    LaunchFiles, get_launch_files, open_pdf, path_exists, pdf_args, read_annotations, save_pdf,
};
use commands::settings::{load_settings, save_settings};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files = pdf_args(args);
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(LaunchFiles(std::sync::Mutex::new(pdf_args(std::env::args().skip(1)))))
        .invoke_handler(tauri::generate_handler![
            open_pdf,
            get_launch_files,
            load_settings,
            save_settings,
            save_pdf,
            read_annotations,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
