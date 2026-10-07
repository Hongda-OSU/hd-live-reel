//! Lists and copies photos from a USB-connected iPhone via the Swift
//! `photos-helper` sidecar, which prints JSON.

use std::ffi::OsStr;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{de::DeserializeOwned, Deserialize, Serialize};

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
}
