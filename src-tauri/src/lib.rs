pub mod clips;
pub mod ffmpeg;
pub mod iphone;
pub mod music;
pub mod project;
pub mod render;
mod sidecar;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

/// File of the project the window is editing.
struct CurrentProject(Mutex<Option<PathBuf>>);

/// Numbers preview files so a slow, stale render never overwrites or
/// deletes a newer one.
struct PreviewCounter(AtomicU64);

/// Set by `cancel_export` to stop the export in progress.
struct ExportCancel(Arc<AtomicBool>);

/// Least time between `export-progress` events.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

fn project_store(app: &AppHandle) -> Result<project::Store, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(project::Store::new(dir))
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_cache_dir().map_err(|e| e.to_string())
}

/// Runs slow work (FFmpeg, the photos helper) off the main thread.
async fn blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

/// Reopens the last project (or starts a new one) and makes it current.
/// Clips still on the old portrait-cropped intermediates are re-prepared
/// first, which takes a few seconds once.
#[tauri::command]
async fn load_project(
    app: AppHandle,
    current: State<'_, CurrentProject>,
) -> Result<project::Project, String> {
    let (path, mut project) = project_store(&app)?.open_last()?;
    let cache = cache_dir(&app)?;
    let save_to = path.clone();
    let project = blocking(move || {
        if clips::upgrade(&mut project.clips, &cache)? {
            project::save(&save_to, &project)?;
        }
        Ok(project)
    })
    .await?;
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
    blocking(|| iphone::list().map_err(|e| e.to_string())).await
}

/// Longest side of picker thumbnails, in pixels.
const THUMBNAIL_SIZE: u32 = 320;

/// JPEG thumbnails for `ids`, cached under the app cache dir.
#[tauri::command]
async fn iphone_thumbnails(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<iphone::Thumbnail>, String> {
    let dir = cache_dir(&app)?.join("thumbs");
    blocking(move || iphone::thumbnails(&ids, &dir, THUMBNAIL_SIZE).map_err(|e| e.to_string()))
        .await
}

/// Downloads and prepares iPhone items as clips. Emits `clips-progress`.
#[tauri::command]
async fn add_iphone_clips(app: AppHandle, ids: Vec<String>) -> Result<Vec<project::Clip>, String> {
    let cache = cache_dir(&app)?;
    blocking(move || {
        clips::add_from_iphone(&ids, &cache, |progress| {
            let _ = app.emit("clips-progress", progress);
        })
    })
    .await
}

/// The uncropped picture of `clip` at `at` seconds into it, for the crop
/// picker.
#[tauri::command]
async fn crop_frame(app: AppHandle, clip: project::Clip, at: f64) -> Result<PathBuf, String> {
    let cache = cache_dir(&app)?;
    blocking(move || clips::crop_frame(&clip, at, &cache)).await
}

/// Normalizes a chosen music file into the cache; returns the cached path.
#[tauri::command]
async fn import_music(app: AppHandle, path: PathBuf) -> Result<PathBuf, String> {
    let cache = cache_dir(&app)?;
    blocking(move || music::import(&path, &cache)).await
}

/// Stores the title PNG the frontend laid out; returns its path.
#[tauri::command]
fn save_title_image(app: AppHandle, png: Vec<u8>) -> Result<PathBuf, String> {
    render::save_title_image(&png, &cache_dir(&app)?)
}

/// Renders a low-res preview of `project` and returns the file to play.
#[tauri::command]
async fn render_preview(
    app: AppHandle,
    counter: State<'_, PreviewCounter>,
    project: project::Project,
) -> Result<PathBuf, String> {
    let n = counter.0.fetch_add(1, Ordering::SeqCst);
    let dir = cache_dir(&app)?.join("previews");
    let out = dir.join(format!("preview-{n:06}.mp4"));
    blocking(move || {
        render::render(&project, ffmpeg::Quality::Preview, &out)?;
        // Drop older previews; newer ones may still be in flight.
        for entry in std::fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            let path = entry.path();
            if path.file_name() < out.file_name() {
                let _ = std::fs::remove_file(path);
            }
        }
        Ok(out)
    })
    .await
}

/// Renders the full-quality MP4 into the project's export folder (by
/// default `~/Movies/HD Live Reel/`), emitting
/// `export-progress` (0 to 1). A cancelled export fails with
/// `render::CANCELLED`.
#[tauri::command]
async fn export_video(
    app: AppHandle,
    cancel: State<'_, ExportCancel>,
    project: project::Project,
) -> Result<PathBuf, String> {
    let default = app
        .path()
        .video_dir()
        .map_err(|e| e.to_string())?
        .join("HD Live Reel");
    let cancel = cancel.0.clone();
    cancel.store(false, Ordering::SeqCst);
    blocking(move || {
        let dir = render::export_dir(project.output.folder.as_deref(), &default)?;
        let out = render::export_path(&dir, &project.name);
        let mut last = Instant::now();
        render::export(&project, &out, &cancel, |progress| {
            if last.elapsed() >= PROGRESS_INTERVAL {
                last = Instant::now();
                let _ = app.emit("export-progress", progress);
            }
        })?;
        Ok(out)
    })
    .await
}

/// Stops the export in progress, if any.
#[tauri::command]
fn cancel_export(cancel: State<ExportCancel>) {
    cancel.0.store(true, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(CurrentProject(Mutex::new(None)))
        .manage(PreviewCounter(AtomicU64::new(0)))
        .manage(ExportCancel(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            load_project,
            save_project,
            list_iphone_media,
            iphone_thumbnails,
            add_iphone_clips,
            crop_frame,
            import_music,
            save_title_image,
            render_preview,
            export_video,
            cancel_export
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
