use std::collections::HashMap;
use std::io::{self, Write};
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::error::AppError;
use crate::pdf::dto::{AnnotationDto, DeleteRef, PageSpec};
use crate::pdf::writer::write_incremental_with_pages;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub refs: HashMap<String, String>,
}

/// Windows ERROR_LOCK_VIOLATION: part of the file is locked by another process.
const LOCK_VIOLATION: i32 = 33;

fn write_error(target: &Path, e: io::Error) -> AppError {
    let msg = format!("{}: {e}", target.display());
    let denied = e.kind() == io::ErrorKind::PermissionDenied
        || matches!(e.raw_os_error(), Some(SHARING_VIOLATION | LOCK_VIOLATION));
    if !denied {
        return AppError::Io(msg);
    }
    let read_only = std::fs::metadata(target).is_ok_and(|m| m.permissions().readonly());
    if read_only { AppError::ReadOnly(msg) } else { AppError::Locked(msg) }
}

/// Appends the annotation changes to `source` and atomically replaces `target`
/// (temp file in the target's directory, flushed, then renamed over it). On any
/// error `target` is left untouched.
pub fn save_to_path(
    source: &Path,
    target: &Path,
    upserts: &[AnnotationDto],
    deletes: &[DeleteRef],
) -> Result<SaveResult, AppError> {
    save_to_path_with_pages(source, target, upserts, deletes, None)
}

/// `save_to_path` that also writes a page plan (see `write_incremental_with_pages`).
pub fn save_to_path_with_pages(
    source: &Path,
    target: &Path,
    upserts: &[AnnotationDto],
    deletes: &[DeleteRef],
    pages: Option<&[PageSpec]>,
) -> Result<SaveResult, AppError> {
    let original = read_file(&source.to_string_lossy())?;
    let (bytes, refs) = write_incremental_with_pages(&original, upserts, deletes, pages)?;
    let dir = match target.parent() {
        Some(d) if !d.as_os_str().is_empty() => d,
        _ => Path::new("."),
    };
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| write_error(target, e))?;
    tmp.write_all(&bytes).map_err(|e| write_error(target, e))?;
    tmp.as_file().sync_all().map_err(|e| write_error(target, e))?;
    tmp.persist(target).map_err(|e| write_error(target, e.error))?;
    Ok(SaveResult { refs })
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

#[tauri::command]
pub async fn open_pdf(path: String) -> Result<tauri::ipc::Response, AppError> {
    blocking(move || read_file(&path).map(tauri::ipc::Response::new)).await
}

#[tauri::command]
pub async fn save_pdf(
    source_path: String,
    target_path: String,
    upserts: Vec<AnnotationDto>,
    deletes: Vec<DeleteRef>,
    pages: Option<Vec<PageSpec>>,
) -> Result<SaveResult, AppError> {
    blocking(move || {
        save_to_path_with_pages(
            Path::new(&source_path),
            Path::new(&target_path),
            &upserts,
            &deletes,
            pages.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn read_annotations(path: String) -> Result<Vec<AnnotationDto>, AppError> {
    blocking(move || crate::pdf::reader::read_annotations(&read_file(&path)?)).await
}

/// Whether something exists at `path`; true when that cannot be determined
/// (callers use it to avoid overwriting a file nobody confirmed replacing).
pub fn path_exists_blocking(path: &Path) -> bool {
    path.try_exists().unwrap_or(true)
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, AppError> {
    blocking(move || Ok(path_exists_blocking(Path::new(&path)))).await
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
    fn path_exists_reports_files() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.pdf");
        assert!(!path_exists_blocking(&p));
        std::fs::write(&p, b"x").unwrap();
        assert!(path_exists_blocking(&p));
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
