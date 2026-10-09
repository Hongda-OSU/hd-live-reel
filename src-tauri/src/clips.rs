//! Brings iPhone media into a project: download, normalize once, and
//! describe each item as a `Clip`.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::ffmpeg;
use crate::iphone;
use crate::project::{Clip, ClipKind, Source};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Downloading,
    Normalizing,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Progress {
    pub stage: Stage,
    pub done: usize,
    pub total: usize,
}

/// Downloads `ids` from the phone and returns ready-to-edit clips in the
/// same order. Normalized files are cached per item.
pub fn add_from_iphone(
    ids: &[String],
    cache: &Path,
    report: impl Fn(Progress),
) -> Result<Vec<Clip>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let total = ids.len();
    report(Progress {
        stage: Stage::Downloading,
        done: 0,
        total,
    });
    let downloads = iphone::download(ids, &cache.join("originals")).map_err(|e| e.to_string())?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let mut clips = Vec::with_capacity(total);
    for (done, (id, download)) in ids.iter().zip(&downloads).enumerate() {
        report(Progress {
            stage: Stage::Normalizing,
            done,
            total,
        });
        if let Some(error) = &download.error {
            return Err(format!("{id}: {error}"));
        }
        // A Live Photo's motion is its paired video; a video is the item itself.
        let (kind, still_path, video_path) = match (&download.path, &download.video_path) {
            (Some(still), Some(video)) => (ClipKind::LivePhoto, Some(still.clone()), video.clone()),
            (Some(video), None) => (ClipKind::Video, None, video.clone()),
            _ => return Err(format!("{id}: nothing downloaded")),
        };

        let (normalized, duration) = normalize_cached(cache, id, &video_path)?;
        let taken_at = ffmpeg::probe(&video_path)
            .ok()
            .and_then(|info| info.creation_time);

        clips.push(Clip {
            // Unique even if the same photo is added twice.
            id: format!("{id}@{stamp}-{done}"),
            source: Source::Iphone,
            kind,
            asset_id: Some(id.clone()),
            still_path,
            video_path,
            normalized_path: Some(normalized),
            taken_at,
            duration,
            trim_start: 0.0,
            trim_end: duration,
            muted: false,
            crop_offset: 0.5,
            ai_score: None,
            ai_reason: None,
        });
    }
    Ok(clips)
}

/// Clips prepared before intermediates kept their own shape point at
/// portrait-cropped files. Re-normalizes those from the cached original so
/// every aspect and fill works; returns whether any clip changed.
pub fn upgrade(clips: &mut [Clip], cache: &Path) -> Result<bool, String> {
    let mut changed = false;
    for clip in clips {
        let current = clip
            .normalized_path
            .as_deref()
            .is_some_and(|path| path.to_string_lossy().ends_with(NORMALIZED_SUFFIX));
        let Some(id) = clip.asset_id.clone() else {
            continue;
        };
        if current || !clip.video_path.is_file() {
            continue;
        }
        let (normalized, _) = normalize_cached(cache, &id, &clip.video_path)?;
        clip.normalized_path = Some(normalized);
        changed = true;
    }
    Ok(changed)
}

/// The uncropped picture of `clip` at `at` seconds into it, for the crop
/// picker; cached as `<cache>/frames/<device folder>/<name>.<ms>.jpg`.
pub fn crop_frame(clip: &Clip, at: f64, cache: &Path) -> Result<PathBuf, String> {
    let id = clip
        .asset_id
        .as_deref()
        .ok_or_else(|| format!("{}: no source id", clip.id))?;
    let source = clip
        .normalized_path
        .as_deref()
        .ok_or_else(|| format!("{id}: not prepared yet"))?;
    // Stay a frame short of the end, where there is no picture to grab.
    let at = at.clamp(0.0, (clip.duration - 1.0 / ffmpeg::FPS as f64).max(0.0));
    let millis = (at * 1000.0).round() as u64;
    let path = cache
        .join("frames")
        .join(id)
        .with_extension(format!("{millis}.jpg"));
    if !path.is_file() {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        ffmpeg::still_frame(source, &path, at).map_err(|e| format!("{id}: {e}"))?;
    }
    Ok(path)
}

/// The normalized file for `id` and its duration, reusing the cached file
/// when there is one.
fn normalize_cached(cache: &Path, id: &str, video_path: &Path) -> Result<(PathBuf, f64), String> {
    let normalized = normalized_path(cache, id);
    let duration = if normalized.is_file() {
        ffmpeg::probe(&normalized)
            .map_err(|e| e.to_string())?
            .duration
    } else {
        std::fs::create_dir_all(normalized.parent().unwrap()).map_err(|e| e.to_string())?;
        ffmpeg::normalize(video_path, &normalized)
            .map_err(|e| format!("{id}: {e}"))?
            .duration
    };
    Ok((normalized, duration))
}

/// Ends every current intermediate; older, cropped ones ended in
/// `.c<offset%>.norm.mov`.
const NORMALIZED_SUFFIX: &str = ".full.norm.mov";

/// `<cache>/clips/<device folder>/<name>.full.norm.mov`.
fn normalized_path(cache: &Path, id: &str) -> PathBuf {
    let path = cache.join("clips").join(id);
    path.with_extension(&NORMALIZED_SUFFIX[1..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_path_mirrors_device_layout() {
        assert_eq!(
            normalized_path(Path::new("/c"), "202609_a/IMG_2388.HEIC"),
            Path::new("/c/clips/202609_a/IMG_2388.full.norm.mov")
        );
    }

    /// A 640×480 test pattern under a fake device id.
    fn landscape_clip(cache: &Path) -> Clip {
        let src = cache.join("src.mov");
        crate::ffmpeg::Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=640x480:rate=30:duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                src.to_str().unwrap(),
            ])
            .unwrap();
        Clip {
            id: "c".into(),
            source: Source::Iphone,
            kind: ClipKind::Video,
            asset_id: Some("dev/IMG_0001.MOV".into()),
            still_path: None,
            video_path: src,
            normalized_path: None,
            taken_at: None,
            duration: 1.0,
            trim_start: 0.2,
            trim_end: 0.8,
            muted: false,
            crop_offset: 0.5,
            ai_score: None,
            ai_reason: None,
        }
    }

    #[test]
    fn upgrade_replaces_cropped_intermediates_once() {
        let cache =
            std::env::temp_dir().join(format!("hd-live-reel-upgrade-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let mut clips = vec![Clip {
            normalized_path: Some(cache.join("clips/dev/IMG_0001.c50.norm.mov")),
            ..landscape_clip(&cache)
        }];

        let changed = upgrade(&mut clips, &cache).unwrap();
        let path = clips[0].normalized_path.clone().unwrap();
        let size = crate::ffmpeg::probe(&path).unwrap().video.unwrap();
        let again = upgrade(&mut clips, &cache).unwrap();
        let frame = crop_frame(&clips[0], 0.3, &cache).unwrap();
        std::fs::remove_dir_all(&cache).unwrap();

        assert!(changed);
        assert!(
            path.ends_with("clips/dev/IMG_0001.full.norm.mov"),
            "{path:?}"
        );
        assert_eq!(
            (size.width, size.height),
            (640, 480),
            "own shape, not cropped"
        );
        assert_eq!(
            (clips[0].trim_start, clips[0].trim_end),
            (0.2, 0.8),
            "trims kept"
        );
        assert!(!again, "already current");
        assert!(frame.ends_with("frames/dev/IMG_0001.300.jpg"), "{frame:?}");
    }

    #[test]
    fn nothing_to_add_is_not_an_error() {
        assert_eq!(add_from_iphone(&[], Path::new("/c"), |_| {}), Ok(vec![]));
    }

    #[test]
    fn progress_serializes_for_the_frontend() {
        let json = serde_json::to_value(Progress {
            stage: Stage::Normalizing,
            done: 2,
            total: 9,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({"stage": "normalizing", "done": 2, "total": 9})
        );
    }
}
