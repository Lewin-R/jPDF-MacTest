use std::io;
use std::sync::Mutex;

use tauri::State;

use crate::error::AppError;

/// Windows ERROR_SHARING_VIOLATION: file is open in another process.
const SHARING_VIOLATION: i32 = 32;

/// `.pdf` paths passed on the command line at startup; handed out once.
#[derive(Default)]
pub struct LaunchFiles(pub Mutex<Vec<String>>);

pub fn pdf_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|a| a.to_lowercase().ends_with(".pdf"))
        .collect()
}

pub fn read_file(path: &str) -> Result<Vec<u8>, AppError> {
    std::fs::read(path).map_err(|e| {
        let msg = format!("{path}: {e}");
        if e.raw_os_error() == Some(SHARING_VIOLATION) {
            return AppError::Locked(msg);
        }
        match e.kind() {
            io::ErrorKind::NotFound => AppError::NotFound(msg),
            io::ErrorKind::PermissionDenied => AppError::Locked(msg),
            _ => AppError::Io(msg),
        }
    })
}

#[tauri::command]
pub async fn open_pdf(path: String) -> Result<tauri::ipc::Response, AppError> {
    read_file(&path).map(tauri::ipc::Response::new)
}

#[tauri::command]
pub fn get_launch_files(state: State<LaunchFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_pdf_missing_file_returns_not_found() {
        let err = read_file("Z:/definitely/not/here.pdf").unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn read_file_returns_bytes() {
        let p = std::env::temp_dir().join("juliepdf_read_file_test.pdf");
        std::fs::write(&p, b"%PDF-1.7 test").unwrap();
        let bytes = read_file(p.to_str().unwrap()).unwrap();
        std::fs::remove_file(&p).ok();
        assert_eq!(bytes, b"%PDF-1.7 test");
    }

    #[test]
    fn pdf_args_filters_case_insensitively() {
        let got = pdf_args(["app.exe".into(), "a.PDF".into(), "b.txt".into(), "c.pdf".into()]);
        assert_eq!(got, vec!["a.PDF", "c.pdf"]);
    }

    #[test]
    fn launch_files_taken_once() {
        let l = LaunchFiles(Mutex::new(vec!["a.pdf".into()]));
        assert_eq!(std::mem::take(&mut *l.0.lock().unwrap()), vec!["a.pdf"]);
        assert!(l.0.lock().unwrap().is_empty());
    }
}
