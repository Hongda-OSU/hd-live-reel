//! Brings a chosen music file into the cache once, normalized for mixing,
//! so the project keeps working if the original is moved or deleted.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::ffmpeg;

/// Normalizes `src` into `<cache>/music/<name>-<content hash>.flac` and
/// returns that path; importing the same file again reuses it.
pub fn import(src: &Path, cache: &Path) -> Result<PathBuf, String> {
    let bytes = std::fs::read(src).map_err(|e| format!("{}: {e}", src.display()))?;
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    let stem = src
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "music".into());
    let path = cache
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
}
