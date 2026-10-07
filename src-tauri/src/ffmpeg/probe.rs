use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::Path;

use serde::Deserialize;

use super::{Error, Tool};

/// What the processing chain needs to know about a source file.
#[derive(Debug, Clone, PartialEq)]
pub struct MediaInfo {
    pub duration: f64,
    /// UTC capture time from the container, e.g. "2026-09-27T15:18:01.000000Z".
    pub creation_time: Option<String>,
    pub video: Option<VideoInfo>,
    pub has_audio: bool,
}

/// The first video stream. Live Photo MOVs carry extra video streams
/// (depth and similar maps) after the real picture; those are ignored.
#[derive(Debug, Clone, PartialEq)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub pix_fmt: String,
    pub full_range: bool,
    pub primaries: Option<String>,
    pub transfer: Option<String>,
}

pub fn probe(path: &Path) -> Result<MediaInfo, Error> {
    let args = [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
    ];
    let output = Tool::Ffprobe.run(args.iter().map(OsStr::new).chain([path.as_os_str()]))?;
    parse(&output.stdout)
}

#[derive(Deserialize)]
struct Raw {
    #[serde(default)]
    streams: Vec<RawStream>,
    format: RawFormat,
}

#[derive(Deserialize)]
struct RawStream {
    codec_type: String,
    width: Option<u32>,
    height: Option<u32>,
    pix_fmt: Option<String>,
    color_range: Option<String>,
    color_primaries: Option<String>,
    color_transfer: Option<String>,
}

#[derive(Deserialize)]
struct RawFormat {
    duration: Option<String>,
    #[serde(default)]
    tags: HashMap<String, String>,
}

fn parse(json: &[u8]) -> Result<MediaInfo, Error> {
    let raw: Raw = serde_json::from_slice(json).map_err(|e| Error::Parse(e.to_string()))?;
    let duration = raw
        .format
        .duration
        .as_deref()
        .and_then(|d| d.parse().ok())
        .ok_or_else(|| Error::Parse("missing duration".into()))?;

    let video = raw
        .streams
        .iter()
        .find(|s| s.codec_type == "video")
        .map(|s| {
            let pix_fmt = s.pix_fmt.clone().unwrap_or_default();
            VideoInfo {
                width: s.width.unwrap_or(0),
                height: s.height.unwrap_or(0),
                // "yuvj*" formats are full range even when color_range is unset.
                full_range: s.color_range.as_deref() == Some("pc") || pix_fmt.starts_with("yuvj"),
                pix_fmt,
                primaries: s.color_primaries.clone(),
                transfer: s.color_transfer.clone(),
            }
        });

    Ok(MediaInfo {
        duration,
        creation_time: raw.format.tags.get("creation_time").cloned(),
        video,
        has_audio: raw.streams.iter().any(|s| s.codec_type == "audio"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Trimmed ffprobe output of a real Live Photo MOV (location tags removed).
    const LIVE_PHOTO: &str = r#"{
        "streams": [
            {"codec_type": "video", "width": 1920, "height": 1440, "pix_fmt": "yuvj420p",
             "color_range": "pc", "color_primaries": "smpte432", "color_transfer": "bt709"},
            {"codec_type": "video", "width": 256, "height": 192, "pix_fmt": "gray"},
            {"codec_type": "audio"},
            {"codec_type": "data"}
        ],
        "format": {"duration": "1.998333", "tags": {"creation_time": "2026-09-27T15:18:01.000000Z"}}
    }"#;

    #[test]
    fn parses_live_photo() {
        let info = parse(LIVE_PHOTO.as_bytes()).unwrap();
        assert_eq!(info.duration, 1.998333);
        assert_eq!(
            info.creation_time.as_deref(),
            Some("2026-09-27T15:18:01.000000Z")
        );
        assert!(info.has_audio);
        let video = info.video.unwrap();
        assert_eq!((video.width, video.height), (1920, 1440));
        assert!(video.full_range);
        assert_eq!(video.primaries.as_deref(), Some("smpte432"));
    }

    #[test]
    fn yuvj_implies_full_range() {
        let json = r#"{"streams": [{"codec_type": "video", "pix_fmt": "yuvj420p"}],
                       "format": {"duration": "1"}}"#;
        assert!(parse(json.as_bytes()).unwrap().video.unwrap().full_range);
    }

    #[test]
    fn missing_duration_is_an_error() {
        let json = r#"{"streams": [], "format": {}}"#;
        assert!(matches!(parse(json.as_bytes()), Err(Error::Parse(_))));
    }

    #[test]
    fn probes_a_generated_clip() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-probe-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let clip = dir.join("clip.mp4");
        Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x240:rate=30:duration=1",
                "-f",
                "lavfi",
                "-i",
                "sine=duration=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                clip.to_str().unwrap(),
            ])
            .unwrap();

        let info = probe(&clip).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!((info.duration - 1.0).abs() < 0.1, "{}", info.duration);
        assert!(info.has_audio);
        let video = info.video.unwrap();
        assert_eq!((video.width, video.height), (320, 240));
        assert!(!video.full_range);
    }
}
