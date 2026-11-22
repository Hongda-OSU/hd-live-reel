//! Brings a chosen music file into the app's storage once, normalized for
//! mixing, so the project keeps working if the original is moved or
//! deleted. It is the only copy, so it lives outside the cache.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::ffmpeg;

/// Normalizes `src` into `<dir>/music/<name>-<content hash>.flac` and
/// returns that path; importing the same file again reuses it.
pub fn import(src: &Path, dir: &Path) -> Result<PathBuf, String> {
    let bytes = std::fs::read(src).map_err(|e| format!("{}: {e}", src.display()))?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "music".into());
    let path = dir
        .join("music")
        .join(format!("{stem}-{:016x}.flac", hasher.finish()));
    if !path.is_file() {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        // Write beside the target first so a failed run leaves no half file
        // that a later import would mistake for a finished one.
        let partial = path.with_extension("partial.flac");
        ffmpeg::normalize_music(src, &partial).map_err(|e| format!("{stem}: {e}"))?;
        std::fs::rename(&partial, &path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Moves music imported while it was kept in `<cache>/music` to
/// `<dir>/music`, and forgets music whose file is gone so the sound panel
/// asks for it again. Returns whether `path` changed.
pub fn restore(path: &mut Option<PathBuf>, cache: &Path, dir: &Path) -> Result<bool, String> {
    let Some(current) = path.as_ref() else {
        return Ok(false);
    };
    if !current.is_file() {
        *path = None;
        return Ok(true);
    }
    let Ok(name) = current.strip_prefix(cache.join("music")) else {
        return Ok(false);
    };
    let moved = dir.join("music").join(name);
    std::fs::create_dir_all(moved.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::rename(current, &moved).map_err(|e| format!("{}: {e}", current.display()))?;
    *path = Some(moved);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg::Tool;

    #[test]
    fn imports_once_under_the_song_name() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-import-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("Elegy.wav");
        Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=duration=1",
                src.to_str().unwrap(),
            ])
            .unwrap();
        let cache = dir.join("cache");
        let first = import(&src, &cache).unwrap();
        let built = std::fs::metadata(&first).unwrap().modified().unwrap();
        let again = import(&src, &cache).unwrap();
        let reused = std::fs::metadata(&again).unwrap().modified().unwrap();
        let leftovers = std::fs::read_dir(cache.join("music")).unwrap().count();
        std::fs::remove_dir_all(&dir).unwrap();

        let name = first.file_name().unwrap().to_string_lossy().into_owned();
        assert!(
            name.starts_with("Elegy-") && name.ends_with(".flac"),
            "{name}"
        );
        assert_eq!(first, again);
        assert_eq!(built, reused, "not rebuilt");
        assert_eq!(leftovers, 1, "no partial file left behind");
    }

    #[test]
    fn restore_moves_cached_music_and_forgets_lost_music() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-music-{}", std::process::id()));
        let (cache, store) = (dir.join("cache"), dir.join("store"));
        std::fs::create_dir_all(cache.join("music")).unwrap();
        let cached = cache.join("music/Elegy-0.flac");
        std::fs::write(&cached, b"flac").unwrap();

        let mut kept = Some(cached);
        let moved = restore(&mut kept, &cache, &store).unwrap();
        let mut lost = Some(cache.join("music/Gone-0.flac"));
        let forgot = restore(&mut lost, &cache, &store).unwrap();
        let mut none = None;
        let untouched = restore(&mut none, &cache, &store).unwrap();
        let landed = store.join("music/Elegy-0.flac").is_file();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!(moved && landed);
        assert_eq!(kept, Some(store.join("music/Elegy-0.flac")));
        assert!(forgot);
        assert_eq!(lost, None);
        assert!(!untouched);
    }
}
