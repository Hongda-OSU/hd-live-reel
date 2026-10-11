//! Lists and copies photos from a USB-connected iPhone via the Swift
//! `photos-helper` sidecar, which prints JSON.

use std::ffi::OsStr;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::select::Score;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaKind {
    Photo,
    Video,
    LivePhoto,
}

/// One picker entry. `id` is "<device folder>/<file name>".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub kind: MediaKind,
    pub name: String,
    pub size: u64,
    pub created_at: Option<String>,
    /// The paired video of a Live Photo.
    pub video: Option<FileRef>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileRef {
    pub id: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Downloaded {
    pub id: String,
    pub path: Option<PathBuf>,
    pub video_path: Option<PathBuf>,
    pub error: Option<String>,
}

/// A JPEG thumbnail on disk, or why there is none.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Thumbnail {
    pub id: String,
    pub path: Option<PathBuf>,
    pub error: Option<String>,
}

#[derive(Debug)]
pub enum Error {
    Spawn(std::io::Error),
    /// The helper's own message, e.g. "no device found" or "iPhone is locked".
    Helper(String),
    Parse(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Spawn(source) => write!(f, "could not start photos-helper: {source}"),
            Error::Helper(message) => f.write_str(message),
            Error::Parse(message) => write!(f, "unexpected photos-helper output: {message}"),
        }
    }
}

impl std::error::Error for Error {}

/// Everything on the phone, newest first.
pub fn list() -> Result<Vec<MediaItem>, Error> {
    run(["list"])
}

/// Copies items (and Live Photo videos) to `<dir>/<device folder>/<name>`.
/// Per-item failures come back in `Downloaded::error`.
pub fn download(ids: &[String], dir: &Path) -> Result<Vec<Downloaded>, Error> {
    let mut args: Vec<&OsStr> = vec!["download".as_ref()];
    args.extend(ids.iter().map(OsStr::new));
    args.extend(["--to".as_ref(), dir.as_os_str()]);
    run(args)
}

/// Writes thumbnails (longest side `max_pixels`) to `<dir>/<id>.jpg`.
/// Ones already on disk are returned without asking the phone, so this
/// works for cached items even when no iPhone is connected.
pub fn thumbnails(ids: &[String], dir: &Path, max_pixels: u32) -> Result<Vec<Thumbnail>, Error> {
    let cached = |id: &String| {
        let path = dir.join(format!("{id}.jpg"));
        path.is_file().then_some(path)
    };
    let missing: Vec<&String> = ids.iter().filter(|id| cached(id).is_none()).collect();
    let mut fetched: Vec<Thumbnail> = Vec::new();
    if !missing.is_empty() {
        let size = max_pixels.to_string();
        let mut args: Vec<&OsStr> = vec!["thumbnails".as_ref()];
        args.extend(missing.iter().map(OsStr::new));
        args.extend([
            "--to".as_ref(),
            dir.as_os_str(),
            "--size".as_ref(),
            size.as_ref(),
        ]);
        fetched = run(args)?;
    }
    Ok(ids
        .iter()
        .map(|id| match cached(id) {
            Some(path) => Thumbnail {
                id: id.clone(),
                path: Some(path),
                error: None,
            },
            None => fetched
                .iter()
                .find(|t| &t.id == id)
                .cloned()
                .unwrap_or_else(|| Thumbnail {
                    id: id.clone(),
                    path: None,
                    error: Some("no thumbnail".into()),
                }),
        })
        .collect())
}

/// Vision scores for each image file, in order; `None` where the helper
/// could not read one.
pub fn score(paths: &[PathBuf]) -> Result<Vec<Option<Score>>, Error> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Scored {
        aesthetics: Option<f32>,
        utility: Option<bool>,
        detail: Option<f32>,
        feature_print: Option<Vec<f32>>,
    }
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    let mut args: Vec<&OsStr> = vec!["score".as_ref()];
    args.extend(paths.iter().map(|p| p.as_os_str()));
    let scored: Vec<Scored> = run(args)?;
    Ok(scored
        .into_iter()
        .map(|s| {
            Some(Score {
                aesthetics: s.aesthetics?,
                utility: s.utility?,
                detail: s.detail?,
                feature_print: s.feature_print?,
            })
        })
        .collect())
}

fn run<T, I, S>(args: I) -> Result<T, Error>
where
    T: DeserializeOwned,
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = Command::new(crate::sidecar::path("photos-helper"))
        .args(args)
        .output()
        .map_err(Error::Spawn)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.trim().trim_start_matches("photos-helper: ");
        return Err(Error::Helper(message.to_string()));
    }
    serde_json::from_slice(&output.stdout).map_err(|e| Error::Parse(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_list_output() {
        // Shape of `photos-helper list`; Swift omits nil fields.
        let json = r#"[
            {"createdAt": "2026-10-03T23:02:13Z", "id": "202610_a/IMG_2589.HEIC",
             "kind": "livePhoto", "name": "IMG_2589.HEIC", "size": 7750342,
             "video": {"id": "202610_a/IMG_2589.MOV", "name": "IMG_2589.MOV", "size": 3812154}},
            {"id": "202610_a/IMG_1960.MP4", "kind": "video", "name": "IMG_1960.MP4", "size": 1584461}
        ]"#;
        let items: Vec<MediaItem> = serde_json::from_str(json).unwrap();
        assert_eq!(items[0].kind, MediaKind::LivePhoto);
        assert_eq!(items[0].video.as_ref().unwrap().name, "IMG_2589.MOV");
        assert_eq!(items[1].created_at, None);
        assert_eq!(items[1].video, None);
    }

    #[test]
    fn serializes_camel_case_for_the_frontend() {
        let item = MediaItem {
            id: "f/a.HEIC".into(),
            kind: MediaKind::LivePhoto,
            name: "a.HEIC".into(),
            size: 1,
            created_at: Some("2026-10-03T23:02:13Z".into()),
            video: None,
        };
        let json = serde_json::to_value(&item).unwrap();
        assert_eq!(json["kind"], "livePhoto");
        assert_eq!(json["createdAt"], "2026-10-03T23:02:13Z");
    }

    #[test]
    fn parses_download_output() {
        let json = r#"[
            {"id": "f/a.HEIC", "path": "/c/f/a.HEIC", "videoPath": "/c/f/a.MOV"},
            {"error": "not found on device", "id": "nope/b.HEIC"}
        ]"#;
        let results: Vec<Downloaded> = serde_json::from_str(json).unwrap();
        assert_eq!(
            results[0].video_path.as_deref(),
            Some(Path::new("/c/f/a.MOV"))
        );
        assert_eq!(results[1].error.as_deref(), Some("not found on device"));
    }

    #[test]
    fn cached_thumbnails_need_no_phone() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-thumbs-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("f")).unwrap();
        std::fs::write(dir.join("f/a.HEIC.jpg"), b"jpg").unwrap();
        let result = thumbnails(&["f/a.HEIC".into()], &dir, 320);
        std::fs::remove_dir_all(&dir).unwrap();
        let thumbs = result.unwrap();
        assert_eq!(
            thumbs[0].path.as_deref(),
            Some(dir.join("f/a.HEIC.jpg").as_path())
        );
    }

    #[test]
    fn scores_pictures_with_vision() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-score-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let (busy, plain) = (dir.join("busy.jpg"), dir.join("plain.jpg"));
        for (source, path) in [
            ("testsrc2=size=320x240", &busy),
            ("color=c=0x4a90d9:size=320x240", &plain),
        ] {
            crate::ffmpeg::Tool::Ffmpeg
                .run([
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    source,
                    "-frames:v",
                    "1",
                    path.to_str().unwrap(),
                ])
                .unwrap();
        }
        let missing = dir.join("missing.jpg");
        let scores = score(&[busy, plain, missing]).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        let busy = scores[0].as_ref().unwrap();
        let plain = scores[1].as_ref().unwrap();
        assert!((-1.0..=1.0).contains(&busy.aesthetics));
        assert_eq!(busy.feature_print.len(), 768);
        assert!(busy.detail > crate::select::PLAIN_DETAIL, "{}", busy.detail);
        assert!(
            plain.detail < crate::select::PLAIN_DETAIL,
            "{}",
            plain.detail
        );
        assert_eq!(scores[2], None, "unreadable file");
    }

    #[test]
    fn parses_thumbnails_output() {
        let json = r#"[
            {"id": "f/a.HEIC", "path": "/c/thumbs/f/a.HEIC.jpg"},
            {"error": "timed out", "id": "f/b.MOV"}
        ]"#;
        let results: Vec<Thumbnail> = serde_json::from_str(json).unwrap();
        assert_eq!(
            results[0].path.as_deref(),
            Some(Path::new("/c/thumbs/f/a.HEIC.jpg"))
        );
        assert_eq!(results[1].error.as_deref(), Some("timed out"));
    }
}
