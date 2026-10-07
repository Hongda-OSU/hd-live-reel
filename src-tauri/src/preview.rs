//! Turns picked iPhone items into a preview video:
//! download → normalize (cached per item) → compose at preview quality.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::ffmpeg::{self, Composition, Quality};
use crate::iphone;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Downloading,
    Normalizing,
    Composing,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Progress {
    pub stage: Stage,
    pub done: usize,
    pub total: usize,
}

/// Builds `<cache>/preview.mp4` from `ids` in the given order. Items already
/// normalized by an earlier run are not downloaded again.
pub fn make_preview(
    ids: &[String],
    cache: &Path,
    report: impl Fn(Progress),
) -> Result<PathBuf, String> {
    if ids.is_empty() {
        return Err("pick at least one Live Photo or video".into());
    }
    let normalized: Vec<PathBuf> = ids.iter().map(|id| normalized_path(cache, id)).collect();
    let missing: Vec<(&String, &PathBuf)> = ids
        .iter()
        .zip(&normalized)
        .filter(|(_, path)| !path.is_file())
        .collect();

    if !missing.is_empty() {
        let total = missing.len();
        report(Progress {
            stage: Stage::Downloading,
            done: 0,
            total,
        });
        let missing_ids: Vec<String> = missing.iter().map(|(id, _)| (*id).clone()).collect();
        let downloads =
            iphone::download(&missing_ids, &cache.join("originals")).map_err(|e| e.to_string())?;

        for (done, ((id, dst), download)) in missing.iter().zip(&downloads).enumerate() {
            report(Progress {
                stage: Stage::Normalizing,
                done,
                total,
            });
            if let Some(error) = &download.error {
                return Err(error.clone());
            }
            // A Live Photo's motion lives in its video; plain videos are the item.
            let source = download
                .video_path
                .as_ref()
                .or(download.path.as_ref())
                .ok_or_else(|| format!("{id}: nothing downloaded"))?;
            std::fs::create_dir_all(dst.parent().unwrap()).map_err(|e| e.to_string())?;
            ffmpeg::normalize(source, dst, 0.5).map_err(|e| format!("{id}: {e}"))?;
        }
    }

    report(Progress {
        stage: Stage::Composing,
        done: 0,
        total: 1,
    });
    let out = cache.join("preview.mp4");
    let composition = Composition {
        clips: normalized.into_iter().map(Into::into).collect(),
        title: None,
    };
    ffmpeg::compose(&composition, Quality::Preview, &out).map_err(|e| e.to_string())?;
    Ok(out)
}

/// `<cache>/clips/<device folder>/<name>.norm.mov`
fn normalized_path(cache: &Path, id: &str) -> PathBuf {
    cache.join("clips").join(id).with_extension("norm.mov")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_path_mirrors_the_device_layout() {
        assert_eq!(
            normalized_path(Path::new("/c"), "202609_a/IMG_2388.HEIC"),
            Path::new("/c/clips/202609_a/IMG_2388.norm.mov")
        );
    }

    #[test]
    fn rejects_an_empty_pick() {
        assert!(make_preview(&[], Path::new("/c"), |_| {}).is_err());
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
