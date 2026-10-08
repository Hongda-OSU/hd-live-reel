//! Converts a chosen music file once into a uniform, loudness-matched FLAC
//! that the composition can loop, trim and mix.

use std::path::Path;

use super::{loudness, probe, Error, Tool};

/// Loudness music is pulled to. Songs are mastered far louder (around
/// −8 to −14 LUFS) than the −30 LUFS clips, so this sits between them.
pub const MUSIC_LUFS: f64 = -16.0;
/// Cap on the boost for unusually quiet tracks.
const MAX_MUSIC_GAIN_DB: f64 = 10.0;

/// Normalizes `src` into `dst` (a `.flac`) and returns its length in seconds.
pub fn normalize_music(src: &Path, dst: &Path) -> Result<f64, Error> {
    let info = probe(src)?;
    if !info.has_audio {
        return Err(Error::Parse("no audio stream".into()));
    }
    let gain = music_gain(loudness(src)?);
    // A boost could push peaks past full scale; the limiter catches them.
    let limiter = if gain > 0.0 {
        ",alimiter=limit=0.97:latency=1"
    } else {
        ""
    };
    Tool::Ffmpeg.run([
        "-y".as_ref(),
        "-v".as_ref(),
        "error".as_ref(),
        "-i".as_ref(),
        src.as_os_str(),
        "-map".as_ref(),
        "0:a:0".as_ref(),
        "-af".as_ref(),
        format!("aresample=48000,aformat=channel_layouts=stereo,volume={gain:.1}dB{limiter}")
            .as_ref(),
        "-c:a".as_ref(),
        "flac".as_ref(),
        // Gain makes float samples, which FLAC would keep as 32-bit and
        // barely compress (66 MB for a 4-minute song instead of 44 MB).
        "-sample_fmt".as_ref(),
        "s16".as_ref(),
        dst.as_os_str(),
    ] as [&std::ffi::OsStr; 14])?;
    Ok(info.duration)
}

fn music_gain(lufs: Option<f64>) -> f64 {
    lufs.map_or(0.0, |lufs| (MUSIC_LUFS - lufs).min(MAX_MUSIC_GAIN_DB))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loud_songs_come_down_and_quiet_ones_rise_a_little() {
        assert!((music_gain(Some(-8.6)) - -7.4).abs() < 1e-9);
        assert_eq!(music_gain(Some(-40.0)), MAX_MUSIC_GAIN_DB);
        assert_eq!(music_gain(None), 0.0);
    }

    #[test]
    fn normalizes_a_loud_tone() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-music-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("song.mp3");
        Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=330:duration=4:sample_rate=44100,volume=-3dB",
                "-c:a",
                "libmp3lame",
                src.to_str().unwrap(),
            ])
            .unwrap();
        let dst = dir.join("song.flac");
        let duration = normalize_music(&src, &dst).unwrap();
        let lufs = loudness(&dst).unwrap().unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!((duration - 4.0).abs() < 0.1, "{duration}");
        assert!((lufs - MUSIC_LUFS).abs() < 1.0, "{lufs}");
    }
}
