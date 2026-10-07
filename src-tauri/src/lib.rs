pub mod ffmpeg;
pub mod iphone;
pub mod preview;
pub mod project;
mod sidecar;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

/// File of the project the window is editing.
struct CurrentProject(Mutex<Option<PathBuf>>);

fn project_store(app: &AppHandle) -> Result<project::Store, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(project::Store::new(dir))
}

/// Reopens the last project (or starts a new one) and makes it current.
#[tauri::command]
fn load_project(
    app: AppHandle,
    current: State<CurrentProject>,
) -> Result<project::Project, String> {
    let (path, project) = project_store(&app)?.open_last()?;
    *current.0.lock().unwrap() = Some(path);
    Ok(project)
}

/// Writes the frontend's copy over the current project file.
#[tauri::command]
fn save_project(current: State<CurrentProject>, project: project::Project) -> Result<(), String> {
    let current = current.0.lock().unwrap();
    let path = current.as_ref().ok_or("no project is open")?;
    project::save(path, &project)
}

/// Photos, videos and Live Photos on the connected iPhone, newest first.
#[tauri::command]
async fn list_iphone_media() -> Result<Vec<iphone::MediaItem>, String> {
    tauri::async_runtime::spawn_blocking(iphone::list)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Longest side of picker thumbnails, in pixels.
const THUMBNAIL_SIZE: u32 = 320;

/// JPEG thumbnails for `ids`, cached under the app cache dir.
#[tauri::command]
async fn iphone_thumbnails(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<iphone::Thumbnail>, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    tauri::async_runtime::spawn_blocking(move || iphone::thumbnails(&ids, &dir, THUMBNAIL_SIZE))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Builds a low-res preview of `ids` in order. Emits `preview-progress`.
#[tauri::command]
async fn make_preview(app: AppHandle, ids: Vec<String>) -> Result<PathBuf, String> {
    let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        preview::make_preview(&ids, &cache, |progress| {
            let _ = app.emit("preview-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CurrentProject(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            load_project,
            save_project,
            list_iphone_media,
            iphone_thumbnails,
            make_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
