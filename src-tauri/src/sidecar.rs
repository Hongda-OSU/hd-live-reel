//! Bundled helper executables: FFmpeg, ffprobe and photos-helper.

use std::path::{Path, PathBuf};

/// macOS on Apple silicon only; matches the names the scripts in `scripts/`
/// write into `binaries/`.
const TARGET_TRIPLE: &str = "aarch64-apple-darwin";

/// Tauri copies sidecars next to the app executable, both in dev and in the
/// bundle. Test binaries live one level deeper (`target/*/deps`), so fall
/// back to `binaries/` in the repo.
pub fn path(name: &str) -> PathBuf {
    let beside_exe = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(name)))
        .filter(|path| path.is_file());
    beside_exe.unwrap_or_else(|| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../binaries")
            .join(format!("{name}-{TARGET_TRIPLE}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_repo_binaries_under_test() {
        let path = path("ffprobe");
        assert!(
            path.ends_with("binaries/ffprobe-aarch64-apple-darwin"),
            "{path:?}"
        );
    }
}
