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
        let normalized = normalized_path(cache, id, crop_offset);
        let duration = if normalized.is_file() {
            ffmpeg::probe(&normalized)
                .map_err(|e| e.to_string())?
                .duration
        } else {
            std::fs::create_dir_all(normalized.parent().unwrap()).map_err(|e| e.to_string())?;
            ffmpeg::normalize(&video_path, &normalized, crop_offset)
                .map_err(|e| format!("{id}: {e}"))?
                .duration
        };
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
