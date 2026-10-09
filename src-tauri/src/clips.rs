//! Brings iPhone media and files from the Mac into a project: normalize
//! once and describe each item as a `Clip`.

use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeSet, HashMap};
use std::hash::{Hash, Hasher};
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
    /// Share of item `done` normalized so far, 0 to 1; long videos take a
    /// while.
    pub current: f64,
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
        current: 0.0,
    });
    let downloads = iphone::download(ids, &cache.join("originals")).map_err(|e| e.to_string())?;

    let stamp = stamp()?;
    let mut clips = Vec::with_capacity(total);
    for (done, (id, download)) in ids.iter().zip(&downloads).enumerate() {
        let progress = |current| {
            report(Progress {
                stage: Stage::Normalizing,
                done,
                total,
                current,
            })
        };
        progress(0.0);
        if let Some(error) = &download.error {
            return Err(format!("{id}: {error}"));
        }
        // A Live Photo's motion is its paired video; a video is the item itself.
        let (still, video) = match (&download.path, &download.video_path) {
            (Some(still), Some(video)) => (Some(still.clone()), video.clone()),
            (Some(video), None) => (None, video.clone()),
            _ => return Err(format!("{id}: nothing downloaded")),
        };
        let taken_at = ffmpeg::probe(&video)
            .ok()
            .and_then(|info| info.creation_time);
        let item = Item {
            still,
            video,
            taken_at,
        };
        // Unique even if the same photo is added twice.
        let unique = format!("{id}@{stamp}-{done}");
        clips.push(prepare(cache, unique, Source::Iphone, id, item, progress)?);
    }
    Ok(clips)
}

/// What `add_from_files` brought in.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Added {
    pub clips: Vec<Clip>,
    /// Photos without a video beside them, which have no motion to use.
    pub skipped_stills: usize,
}

const VIDEO_EXTENSIONS: [&str; 3] = ["mov", "mp4", "m4v"];
const STILL_EXTENSIONS: [&str; 4] = ["heic", "heif", "jpg", "jpeg"];

/// Starts the cache id of a file from the Mac; iPhone ids are
/// "<device folder>/<name>".
const FILE_PREFIX: &str = "files/";

/// Prepares files and folders dropped or picked on the Mac, oldest first.
/// A photo and a video with the same name in one folder (how Photos
/// exports a Live Photo) become one Live Photo. Originals stay where they
/// are; only their normalized copies go into the cache.
pub fn add_from_files(
    paths: &[PathBuf],
    cache: &Path,
    report: impl Fn(Progress),
) -> Result<Added, String> {
    let (pairs, skipped_stills) = pair(&scan(paths)?);
    let mut dated: Vec<_> = pairs
        .into_iter()
        .map(|(still, video)| {
            let taken_at = ffmpeg::probe(&video)
                .map_err(|e| format!("{}: {e}", video.display()))?
                .creation_time;
            Ok((taken_at, still, video))
        })
        .collect::<Result<_, String>>()?;
    // Undated files go last, in name order.
    dated.sort_by(|a, b| (a.0.is_none(), &a.0, &a.2).cmp(&(b.0.is_none(), &b.0, &b.2)));

    let stamp = stamp()?;
    let total = dated.len();
    let mut clips = Vec::with_capacity(total);
    for (done, (taken_at, still, video)) in dated.into_iter().enumerate() {
        let progress = |current| {
            report(Progress {
                stage: Stage::Normalizing,
                done,
                total,
                current,
            })
        };
        progress(0.0);
        let id = file_id(&video)?;
        let unique = format!("{id}@{stamp}-{done}");
        let item = Item {
            still,
            video,
            taken_at,
        };
        let clip = prepare(cache, unique, Source::File, &id, item, progress)?;
        let thumb = thumbnail_path(cache, &id);
        if !thumb.is_file() {
            std::fs::create_dir_all(thumb.parent().unwrap()).map_err(|e| e.to_string())?;
            ffmpeg::still_frame(
                clip.normalized_path.as_deref().unwrap(),
                &thumb,
                clip.duration / 2.0,
                THUMBNAIL_SIDE,
            )
            .map_err(|e| format!("{id}: {e}"))?;
        }
        clips.push(clip);
    }
    Ok(Added {
        clips,
        skipped_stills,
    })
}

/// Every file under `paths`, looking inside folders and skipping hidden
/// names such as `.DS_Store`.
fn scan(paths: &[PathBuf]) -> Result<BTreeSet<PathBuf>, String> {
    let mut found = BTreeSet::new();
    let mut todo: Vec<PathBuf> = paths.to_vec();
    while let Some(path) = todo.pop() {
        let hidden = path
            .file_name()
            .is_some_and(|name| name.to_string_lossy().starts_with('.'));
        if hidden {
            continue;
        }
        if path.is_dir() {
            for entry in std::fs::read_dir(&path).map_err(|e| format!("{}: {e}", path.display()))? {
                todo.push(entry.map_err(|e| e.to_string())?.path());
            }
        } else if path.is_file() {
            found.insert(path);
        }
    }
    Ok(found)
}

/// Videos with the photo of the same name beside them, if any, and how
/// many photos had no video. Other files are ignored.
fn pair(files: &BTreeSet<PathBuf>) -> (Vec<(Option<PathBuf>, PathBuf)>, usize) {
    let extension = |path: &Path| {
        path.extension()
            .map(|ext| ext.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    let key = |path: &Path| path.with_extension("");
    let mut stills: HashMap<_, PathBuf> = files
        .iter()
        .filter(|path| STILL_EXTENSIONS.contains(&extension(path).as_str()))
        .map(|path| (key(path), path.clone()))
        .collect();
    let pairs = files
        .iter()
        .filter(|path| VIDEO_EXTENSIONS.contains(&extension(path).as_str()))
        .map(|video| (stills.remove(&key(video)), video.clone()))
        .collect();
    (pairs, stills.len())
}

/// `files/<hash>/<name>`: stable for one file, distinct for files that
/// share a name, and kept apart from iPhone ids.
fn file_id(path: &Path) -> Result<String, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("{}: {e}", path.display()))?;
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    // Path, size and time instead of contents: videos can be gigabytes.
    canonical.hash(&mut hasher);
    meta.len().hash(&mut hasher);
    meta.modified().ok().hash(&mut hasher);
    // The frontend joins ids with "|".
    let name = canonical
        .file_name()
        .map(|name| name.to_string_lossy().replace('|', "_"))
        .unwrap_or_default();
    Ok(format!("{FILE_PREFIX}{:016x}/{name}", hasher.finish()))
}

/// Milliseconds since 1970, to keep clip ids unique.
fn stamp() -> Result<u128, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis())
}

/// A Live Photo (photo + video) or a video, ready to prepare.
struct Item {
    still: Option<PathBuf>,
    video: PathBuf,
    taken_at: Option<String>,
}

/// Normalizes `item` under the cache id `id` and describes it, reporting
/// the share done through `on_share`.
fn prepare(
    cache: &Path,
    unique: String,
    source: Source,
    id: &str,
    item: Item,
    on_share: impl FnMut(f64),
) -> Result<Clip, String> {
    let (normalized, duration) = normalize_cached(cache, id, &item.video, on_share)?;
    let kind = if item.still.is_some() {
        ClipKind::LivePhoto
    } else {
        ClipKind::Video
    };
    Ok(Clip {
        id: unique,
        source,
        kind,
        asset_id: Some(id.to_string()),
        still_path: item.still,
        video_path: item.video,
        normalized_path: Some(normalized),
        taken_at: item.taken_at,
        duration,
        trim_start: 0.0,
        trim_end: duration,
        muted: false,
        crop_offset: 0.5,
        ai_score: None,
        ai_reason: None,
    })
}

/// Longest side of clip and picker thumbnails, in pixels.
pub const THUMBNAIL_SIDE: u32 = 320;

/// Thumbnails for iPhone items and added files, in no particular order.
/// iPhone ones come from the phone the first time; a file's was made when
/// it was added.
pub fn thumbnails(ids: &[String], cache: &Path) -> Result<Vec<iphone::Thumbnail>, String> {
    let (files, phone): (Vec<String>, Vec<String>) = ids
        .iter()
        .cloned()
        .partition(|id| id.starts_with(FILE_PREFIX));
    let mut found = if phone.is_empty() {
        Vec::new()
    } else {
        iphone::thumbnails(&phone, &cache.join("thumbs"), THUMBNAIL_SIDE)
            .map_err(|e| e.to_string())?
    };
    found.extend(files.into_iter().map(|id| {
        let path = thumbnail_path(cache, &id);
        let (path, error) = if path.is_file() {
            (Some(path), None)
        } else {
            (None, Some("no thumbnail".into()))
        };
        iphone::Thumbnail { id, path, error }
    }));
    Ok(found)
}

/// Where the phone helper caches thumbnails, used for files too.
fn thumbnail_path(cache: &Path, id: &str) -> PathBuf {
    cache.join("thumbs").join(format!("{id}.jpg"))
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
        let (normalized, _) = normalize_cached(cache, &id, &clip.video_path, |_| {})?;
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
        ffmpeg::still_frame(source, &path, at, CROP_FRAME_SIDE)
            .map_err(|e| format!("{id}: {e}"))?;
    }
    Ok(path)
}

/// Longest side of the crop picker's still, in pixels.
const CROP_FRAME_SIDE: u32 = 960;

/// The normalized file for `id` and its duration, reusing the cached file
/// when there is one.
fn normalize_cached(
    cache: &Path,
    id: &str,
    video_path: &Path,
    on_share: impl FnMut(f64),
) -> Result<(PathBuf, f64), String> {
    let normalized = normalized_path(cache, id);
    let duration = if normalized.is_file() {
        ffmpeg::probe(&normalized)
            .map_err(|e| e.to_string())?
            .duration
    } else {
        std::fs::create_dir_all(normalized.parent().unwrap()).map_err(|e| e.to_string())?;
        // Write beside the target first: a long video cut off half way
        // (the app quit) must not pass for a finished intermediate.
        let partial = normalized.with_extension("partial.mov");
        let duration = ffmpeg::normalize_with_progress(video_path, &partial, on_share)
            .map_err(|e| format!("{id}: {e}"))?
            .duration;
        std::fs::rename(&partial, &normalized).map_err(|e| e.to_string())?;
        duration
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
    fn pairs_live_photos_and_counts_lone_stills() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-pair-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("trip")).unwrap();
        for name in [
            "IMG_0001.HEIC",
            "IMG_0001.MOV",
            "IMG_0002.mov",
            "IMG_0003.JPG",
            ".hidden.mov",
            "notes.txt",
            "trip/IMG_0004.MP4",
        ] {
            std::fs::write(dir.join(name), b"").unwrap();
        }
        // The same file twice, alone and inside its folder.
        let found = scan(&[dir.clone(), dir.join("IMG_0002.mov")]).unwrap();
        let (pairs, skipped) = pair(&found);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(
            pairs,
            vec![
                (Some(dir.join("IMG_0001.HEIC")), dir.join("IMG_0001.MOV")),
                (None, dir.join("IMG_0002.mov")),
                (None, dir.join("trip/IMG_0004.MP4")),
            ]
        );
        assert_eq!(skipped, 1, "IMG_0003.JPG has no motion");
    }

    #[test]
    fn adds_files_once_with_thumbnails() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-files-{}", std::process::id()));
        let (src, cache) = (dir.join("src"), dir.join("cache"));
        std::fs::create_dir_all(&src).unwrap();
        let video = landscape_clip(&src).video_path;
        let moved = src.join("IMG_0001.MOV");
        std::fs::rename(&video, &moved).unwrap();
        std::fs::write(src.join("IMG_0001.HEIC"), b"").unwrap();

        let first = add_from_files(std::slice::from_ref(&src), &cache, |_| {}).unwrap();
        let again = add_from_files(std::slice::from_ref(&moved), &cache, |_| {}).unwrap();
        let clip = &first.clips[0];
        let id = clip.asset_id.clone().unwrap();
        let thumbs = thumbnails(std::slice::from_ref(&id), &cache).unwrap();
        let thumb = crate::ffmpeg::probe(thumbs[0].path.as_ref().unwrap())
            .unwrap()
            .video
            .unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(first.skipped_stills, 0);
        assert_eq!(
            (clip.source, clip.kind),
            (Source::File, ClipKind::LivePhoto)
        );
        assert_eq!(clip.video_path, moved, "original used in place");
        assert!(
            id.starts_with(FILE_PREFIX) && id.ends_with("/IMG_0001.MOV"),
            "{id}"
        );
        assert!(clip.normalized_path.as_ref().unwrap().starts_with(&cache));
        assert_eq!((thumb.width, thumb.height), (320, 240));
        let repeat = &again.clips[0];
        assert_eq!(repeat.asset_id, clip.asset_id, "same file, same cache");
        assert_eq!(repeat.kind, ClipKind::Video, "photo not dropped this time");
        assert_ne!(repeat.id, clip.id);
    }

    /// A 12 s test pattern at `dir/long.mov`.
    fn long_video(dir: &Path) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let video = dir.join("long.mov");
        crate::ffmpeg::Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x240:rate=30:duration=12",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                video.to_str().unwrap(),
            ])
            .unwrap();
        video
    }

    #[test]
    fn reports_progress_within_a_clip_and_leaves_no_partial_file() {
        let dir =
            std::env::temp_dir().join(format!("hd-live-reel-progress-{}", std::process::id()));
        let video = long_video(&dir.join("src"));
        let cache = dir.join("cache");

        let reports = std::cell::RefCell::new(Vec::new());
        add_from_files(std::slice::from_ref(&video), &cache, |p| {
            reports.borrow_mut().push(p.current)
        })
        .unwrap();
        let leftovers: Vec<_> = std::fs::read_dir(cache.join("clips/files"))
            .unwrap()
            .flat_map(|d| std::fs::read_dir(d.unwrap().path()).unwrap())
            .map(|f| f.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        std::fs::remove_dir_all(&dir).unwrap();

        let reports = reports.into_inner();
        assert_eq!(reports[0], 0.0);
        assert!(reports.iter().any(|&share| share > 0.0), "{reports:?}");
        assert!(reports.windows(2).all(|w| w[0] <= w[1]), "{reports:?}");
        assert_eq!(leftovers, ["long.full.norm.mov"]);
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
            current: 0.5,
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({"stage": "normalizing", "done": 2, "total": 9, "current": 0.5})
        );
    }
}
