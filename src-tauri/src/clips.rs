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
/// same order. Normalized files are cached per item and crop offset.
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

        let crop_offset = 0.5;
        let (normalized, duration) = normalize_cached(cache, id, &video_path, crop_offset)?;
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
            crop_offset,
            ai_score: None,
            ai_reason: None,
        });
    }
    Ok(clips)
}

/// Re-normalizes `clip` with a new crop offset (snapped to whole percent,
/// like the cache names) and returns the updated clip. Trims are kept:
/// the same source gives the same frame count.
pub fn recrop(clip: &Clip, crop_offset: f64, cache: &Path) -> Result<Clip, String> {
    let id = clip
        .asset_id
        .as_deref()
        .ok_or_else(|| format!("{}: no source id", clip.id))?;
    let crop_offset = (crop_offset.clamp(0.0, 1.0) * 100.0).round() / 100.0;
    let (normalized, _) = normalize_cached(cache, id, &clip.video_path, crop_offset)?;
    Ok(Clip {
        normalized_path: Some(normalized),
        crop_offset,
        ..clip.clone()
    })
}

/// A still of `clip` before cropping, for the crop picker; cached as
/// `<cache>/frames/<device folder>/<name>.jpg`.
pub fn crop_frame(clip: &Clip, cache: &Path) -> Result<PathBuf, String> {
    let id = clip
        .asset_id
        .as_deref()
        .ok_or_else(|| format!("{}: no source id", clip.id))?;
    let path = cache.join("frames").join(id).with_extension("jpg");
    if !path.is_file() {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        ffmpeg::uncropped_frame(&clip.video_path, &path).map_err(|e| format!("{id}: {e}"))?;
    }
    Ok(path)
}

/// The normalized file for `id` at `crop_offset` and its duration,
/// reusing the cached file when there is one.
fn normalize_cached(
    cache: &Path,
    id: &str,
    video_path: &Path,
    crop_offset: f64,
) -> Result<(PathBuf, f64), String> {
    let normalized = normalized_path(cache, id, crop_offset);
    let duration = if normalized.is_file() {
        ffmpeg::probe(&normalized)
            .map_err(|e| e.to_string())?
            .duration
    } else {
        std::fs::create_dir_all(normalized.parent().unwrap()).map_err(|e| e.to_string())?;
        ffmpeg::normalize(video_path, &normalized, crop_offset)
            .map_err(|e| format!("{id}: {e}"))?
            .duration
    };
    Ok((normalized, duration))
}

/// `<cache>/clips/<device folder>/<name>.c<offset%>.norm.mov`; the crop is
/// baked in, so each offset gets its own file.
fn normalized_path(cache: &Path, id: &str, crop_offset: f64) -> PathBuf {
    let percent = (crop_offset * 100.0).round() as u32;
    cache
        .join("clips")
        .join(id)
        .with_extension(format!("c{percent}.norm.mov"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_path_mirrors_device_layout_and_crop() {
        assert_eq!(
            normalized_path(Path::new("/c"), "202609_a/IMG_2388.HEIC", 0.5),
            Path::new("/c/clips/202609_a/IMG_2388.c50.norm.mov")
        );
        assert_eq!(
            normalized_path(Path::new("/c"), "202609_a/IMG_2388.HEIC", 0.25),
            Path::new("/c/clips/202609_a/IMG_2388.c25.norm.mov")
        );
    }

    /// A 640×480 test pattern whose left and right halves differ.
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

    /// First frame as raw grey pixels at a tiny size.
    fn first_frame(path: &Path) -> Vec<u8> {
        crate::ffmpeg::Tool::Ffmpeg
            .run([
                "-v".as_ref(),
                "error".as_ref(),
                "-i".as_ref(),
                path.as_os_str(),
                "-vf".as_ref(),
                "scale=27:48,format=gray".as_ref(),
                "-frames:v".as_ref(),
                "1".as_ref(),
                "-f".as_ref(),
                "rawvideo".as_ref(),
                "-".as_ref(),
            ] as [&std::ffi::OsStr; 11])
            .unwrap()
            .stdout
    }

    #[test]
    fn recrop_moves_the_window_and_reuses_files() {
        let cache =
            std::env::temp_dir().join(format!("hd-live-reel-recrop-{}", std::process::id()));
        std::fs::create_dir_all(&cache).unwrap();
        let clip = landscape_clip(&cache);

        let left = recrop(&clip, 0.0, &cache).unwrap();
        let right = recrop(&clip, 0.996, &cache).unwrap();
        let left_path = left.normalized_path.clone().unwrap();
        let built = std::fs::metadata(&left_path).unwrap().modified().unwrap();
        let again = recrop(&clip, 0.001, &cache).unwrap();
        let reused = std::fs::metadata(&left_path).unwrap().modified().unwrap();
        let (left_px, right_px) = (
            first_frame(&left_path),
            first_frame(right.normalized_path.as_ref().unwrap()),
        );
        let frame = crop_frame(&clip, &cache).unwrap();
        std::fs::remove_dir_all(&cache).unwrap();

        assert_eq!(left.crop_offset, 0.0);
        assert_eq!(right.crop_offset, 1.0, "snapped to whole percent");
        assert_eq!((left.trim_start, left.trim_end), (0.2, 0.8), "trims kept");
        assert!(left_path.ends_with("IMG_0001.c0.norm.mov"));
        assert_ne!(left_px, right_px, "different part of the picture");
        assert_eq!(again.normalized_path, left.normalized_path);
        assert_eq!(built, reused, "cached file not rebuilt");
        assert!(frame.ends_with("frames/dev/IMG_0001.jpg"));
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
