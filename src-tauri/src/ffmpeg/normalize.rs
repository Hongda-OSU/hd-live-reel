//! Converts each source clip once into a uniform intermediate file:
//! 30 fps, BT.709 SDR, stereo 48 kHz, loudness-matched, in the source's own
//! shape. Fitting it to the output frame happens in `compose`, so changing
//! the aspect, fill or crop never re-encodes a clip.

use std::path::Path;

use super::{probe, Error, MediaInfo, Tool, VideoInfo};

pub const FPS: u32 = 30;
/// Longest side of an intermediate; larger sources (4K) are scaled down.
pub const MAX_SIDE: u32 = 1920;

/// Loudness every clip is pulled towards.
pub const TARGET_LUFS: f64 = -30.0;
/// Cap on the boost, so near-silent clips don't turn wind noise into a roar.
pub const MAX_GAIN_DB: f64 = 18.0;
/// Very short fade at both ends of each clip to avoid clicks at the joins.
pub const EDGE_FADE: f64 = 0.03;

#[derive(Debug, Clone, PartialEq)]
pub struct Normalized {
    /// Length after snapping to whole frames, in seconds.
    pub duration: f64,
    pub lufs: Option<f64>,
    pub gain_db: f64,
}

/// Normalizes `src` into `dst` (a `.mov`; audio is kept as PCM).
pub fn normalize(src: &Path, dst: &Path) -> Result<Normalized, Error> {
    let info = probe(src)?;
    let lufs = if info.has_audio { loudness(src)? } else { None };
    let plan = plan(&info, lufs)?;

    let mut args: Vec<String> = vec!["-y".into(), "-v".into(), "error".into()];
    args.extend(["-i".into(), src.to_string_lossy().into_owned()]);
    let audio_input = if info.has_audio {
        "0:a:0"
    } else {
        args.extend(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"].map(String::from));
        "1:a:0"
    };
    args.extend(["-map", "0:v:0", "-map", audio_input].map(String::from));
    args.extend([
        "-vf".into(),
        plan.video_filter,
        "-af".into(),
        plan.audio_filter,
    ]);
    args.extend(["-frames:v".into(), plan.frames.to_string()]);
    args.extend(
        [
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "16",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-c:a",
            "pcm_s16le",
        ]
        .map(String::from),
    );
    args.push(dst.to_string_lossy().into_owned());
    Tool::Ffmpeg.run(&args)?;

    Ok(Normalized {
        duration: plan.duration,
        lufs,
        gain_db: plan.gain_db,
    })
}

/// Integrated loudness (LUFS) of the first audio stream.
pub fn loudness(path: &Path) -> Result<Option<f64>, Error> {
    let output = Tool::Ffmpeg.run([
        "-hide_banner".as_ref(),
        "-i".as_ref(),
        path.as_os_str(),
        "-map".as_ref(),
        "0:a:0".as_ref(),
        "-af".as_ref(),
        "ebur128=framelog=quiet".as_ref(),
        "-f".as_ref(),
        "null".as_ref(),
        "-".as_ref(),
    ] as [&std::ffi::OsStr; 10])?;
    Ok(parse_integrated_loudness(&String::from_utf8_lossy(
        &output.stderr,
    )))
}

/// The ebur128 summary ends with a line like `I:  -50.8 LUFS`.
fn parse_integrated_loudness(stderr: &str) -> Option<f64> {
    stderr
        .lines()
        .rev()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("I:"))
        .and_then(|rest| rest.split_whitespace().next())
        .and_then(|value| value.parse().ok())
        .filter(|lufs: &f64| lufs.is_finite())
}

pub fn gain_db(lufs: Option<f64>) -> f64 {
    lufs.map_or(0.0, |lufs| (TARGET_LUFS - lufs).clamp(0.0, MAX_GAIN_DB))
}

#[derive(Debug, Clone, PartialEq)]
struct Plan {
    frames: u32,
    duration: f64,
    gain_db: f64,
    video_filter: String,
    audio_filter: String,
}

fn plan(info: &MediaInfo, lufs: Option<f64>) -> Result<Plan, Error> {
    let video = info
        .video
        .as_ref()
        .ok_or_else(|| Error::Parse("no video stream".into()))?;
    // Frame-exact length, so audio and video end together at every join.
    let frames = (info.duration * FPS as f64).floor() as u32;
    let duration = frames as f64 / FPS as f64;
    let gain_db = gain_db(lufs);

    let video_filter = format!(
        "{},fps={FPS},{},setsar=1",
        colour_filter(video),
        fit_within(MAX_SIDE),
    );
    let audio_filter = format!(
        "aresample=48000,aformat=channel_layouts=stereo,volume={gain_db:.1}dB,\
         apad,atrim=0:{duration:.4},\
         afade=t=in:d={EDGE_FADE},afade=t=out:st={:.4}:d={EDGE_FADE}",
        duration - EDGE_FADE,
    );

    Ok(Plan {
        frames,
        duration,
        gain_db,
        video_filter,
        audio_filter,
    })
}

/// Converts any source to limited-range BT.709 SDR yuv420p.
fn colour_filter(video: &VideoInfo) -> String {
    let range_in = if video.full_range { "full" } else { "limited" };
    // Regular iPhone videos are HDR (HLG, BT.2020). Read as SDR they look
    // washed out, so decode to linear light and tone-map the highlights
    // down with hable, which kept skies and foliage closest to normal.
    if let Some(transfer) = video
        .transfer
        .as_deref()
        .filter(|t| matches!(*t, "arib-std-b67" | "smpte2084"))
    {
        return format!(
            "zscale=rin={range_in}:pin=bt2020:tin={transfer}:min=bt2020nc:t=linear:npl=100,\
             format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,\
             zscale=t=bt709:m=bt709:r=limited,format=yuv420p"
        );
    }
    let primaries_in = video
        .primaries
        .as_deref()
        .filter(|p| matches!(*p, "bt709" | "smpte432" | "bt2020"))
        .unwrap_or("bt709");
    format!(
        "zscale=rin={range_in}:pin={primaries_in}:tin=bt709:min=bt709\
         :r=limited:p=bt709:t=bt709:m=bt709,format=yuv420p"
    )
}

/// Shrinks the picture until both sides are at most `side`, keeping its
/// shape and even dimensions; smaller pictures are left as they are.
fn fit_within(side: u32) -> String {
    format!(
        "scale='min({side},iw)':'min({side},ih)':force_original_aspect_ratio=decrease\
         :force_divisible_by=2:flags=lanczos"
    )
}

/// Writes the frame of the normalized intermediate `src` shown at `at`
/// seconds as a JPEG, whole and at most 960 on a side, so the crop picker
/// shows what the crop leaves out of exactly that moment.
pub fn still_frame(src: &Path, dst: &Path, at: f64) -> Result<(), Error> {
    Tool::Ffmpeg.run([
        "-y".to_string(),
        "-v".into(),
        "error".into(),
        "-ss".into(),
        format!("{:.3}", at.max(0.0)),
        "-i".into(),
        src.to_string_lossy().into_owned(),
        "-vf".into(),
        format!("{},setsar=1", fit_within(MAX_SIDE / 2)),
        "-frames:v".into(),
        "1".into(),
        "-q:v".into(),
        "3".into(),
        dst.to_string_lossy().into_owned(),
    ])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn live_photo() -> MediaInfo {
        MediaInfo {
            duration: 1.998333,
            creation_time: None,
            video: Some(VideoInfo {
                width: 1920,
                height: 1440,
                pix_fmt: "yuvj420p".into(),
                full_range: true,
                primaries: Some("smpte432".into()),
                transfer: Some("bt709".into()),
            }),
            has_audio: true,
        }
    }

    #[test]
    fn live_photo_keeps_its_shape_and_compose_py_sound() {
        let plan = plan(&live_photo(), Some(-50.8)).unwrap();
        assert_eq!(plan.frames, 59);
        assert_eq!(plan.gain_db, 18.0);
        // Colour as compose.py converts it; no fill or crop yet.
        assert_eq!(
            plan.video_filter,
            "zscale=rin=full:pin=smpte432:tin=bt709:min=bt709:r=limited:p=bt709:t=bt709:m=bt709,\
             format=yuv420p,fps=30,\
             scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease\
             :force_divisible_by=2:flags=lanczos,setsar=1"
        );
        assert_eq!(
            plan.audio_filter,
            "aresample=48000,aformat=channel_layouts=stereo,volume=18.0dB,\
             apad,atrim=0:1.9667,afade=t=in:d=0.03,afade=t=out:st=1.9367:d=0.03"
        );
    }

    fn iphone_hdr_video() -> MediaInfo {
        MediaInfo {
            duration: 1.765,
            creation_time: None,
            video: Some(VideoInfo {
                width: 1920,
                height: 1080,
                pix_fmt: "yuv420p10le".into(),
                full_range: false,
                primaries: Some("bt2020".into()),
                transfer: Some("arib-std-b67".into()),
            }),
            has_audio: true,
        }
    }

    #[test]
    fn hdr_video_is_tone_mapped_and_sdr_is_not() {
        let hdr = plan(&iphone_hdr_video(), None).unwrap().video_filter;
        assert!(
            hdr.starts_with("zscale=rin=limited:pin=bt2020:tin=arib-std-b67:min=bt2020nc:t=linear"),
            "{hdr}"
        );
        assert!(hdr.contains("tonemap=tonemap=hable"), "{hdr}");
        let sdr = plan(&live_photo(), None).unwrap().video_filter;
        assert!(!sdr.contains("tonemap"), "{sdr}");
    }

    #[test]
    fn unknown_primaries_fall_back_to_bt709() {
        let mut info = live_photo();
        info.video.as_mut().unwrap().primaries = Some("unknown".into());
        let plan = plan(&info, None).unwrap();
        assert!(plan.video_filter.contains("pin=bt709"));
    }

    #[test]
    fn gain_is_capped_and_never_negative() {
        assert_eq!(gain_db(None), 0.0);
        assert_eq!(gain_db(Some(-58.7)), MAX_GAIN_DB);
        assert!((gain_db(Some(-40.9)) - 10.9).abs() < 1e-9);
        assert_eq!(gain_db(Some(-20.0)), 0.0);
    }

    #[test]
    fn parses_ebur128_summary() {
        let stderr = "[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -50.8 LUFS\n    Threshold: -61.0 LUFS\n";
        assert_eq!(parse_integrated_loudness(stderr), Some(-50.8));
        assert_eq!(parse_integrated_loudness("no summary"), None);
        assert_eq!(parse_integrated_loudness("    I:         -inf LUFS"), None);
    }

    /// Generates a landscape 25 fps clip, optionally with quiet mono audio.
    fn generated_clip(dir: &Path, with_audio: bool) -> std::path::PathBuf {
        let src = dir.join(if with_audio { "src.mov" } else { "silent.mov" });
        let mut args = vec![
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=640x480:rate=25:duration=2",
        ];
        if with_audio {
            args.extend([
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2,volume=-40dB",
            ]);
        }
        args.extend(["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
        if with_audio {
            args.extend(["-c:a", "pcm_s16le"]);
        }
        args.push(src.to_str().unwrap());
        Tool::Ffmpeg.run(&args).unwrap();
        src
    }

    fn stream_summary(path: &Path) -> String {
        let output = Tool::Ffprobe
            .run([
                "-v".as_ref(),
                "error".as_ref(),
                "-show_entries".as_ref(),
                "stream=codec_type,width,height,avg_frame_rate,sample_rate,channels,color_primaries"
                    .as_ref(),
                "-of".as_ref(),
                "compact=p=0".as_ref(),
                path.as_os_str(),
            ] as [&std::ffi::OsStr; 7])
            .unwrap();
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    #[test]
    fn normalizes_a_generated_clip() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-norm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();

        let src = generated_clip(&dir, true);
        let dst = dir.join("out.mov");
        let result = normalize(&src, &dst).unwrap();
        let summary = stream_summary(&dst);
        let out_lufs = loudness(&dst).unwrap().unwrap();

        let silent = generated_clip(&dir, false);
        let silent_dst = dir.join("silent-out.mov");
        let silent_result = normalize(&silent, &silent_dst).unwrap();
        let silent_summary = stream_summary(&silent_dst);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(result.duration, 2.0);
        assert!(result.gain_db > 0.0);
        assert!(
            summary.contains("width=640|height=480|color_primaries=bt709|avg_frame_rate=30/1"),
            "{summary}"
        );
        assert!(
            summary.contains("sample_rate=48000|channels=2"),
            "{summary}"
        );
        // Boosted towards the target (the cap may stop it short).
        assert!(out_lufs > result.lufs.unwrap() + 1.0, "{out_lufs}");

        assert_eq!(silent_result.lufs, None);
        assert!(
            silent_summary.contains("sample_rate=48000|channels=2"),
            "silence added: {silent_summary}"
        );
    }

    #[test]
    fn still_frame_shows_the_whole_picture() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-frame-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = generated_clip(&dir, false);
        let dst = dir.join("frame.jpg");
        still_frame(&src, &dst, 0.5).unwrap();
        let summary = stream_summary(&dst);
        std::fs::remove_dir_all(&dir).unwrap();

        // Already within 960 on a side, so kept as it is.
        assert!(summary.contains("width=640|height=480"), "{summary}");
    }

    /// First-frame signalstats value, e.g. "SATAVG".
    fn first_frame_stat(path: &Path, key: &str) -> f64 {
        let output = Tool::Ffmpeg
            .run([
                "-hide_banner".to_string(),
                "-i".into(),
                path.to_string_lossy().into_owned(),
                "-vf".into(),
                format!("signalstats,metadata=print:key=lavfi.signalstats.{key}"),
                "-frames:v".into(),
                "1".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ])
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        stderr
            .lines()
            .find_map(|line| line.split(&format!("{key}=")).nth(1))
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or_else(|| panic!("no {key} in: {stderr}"))
    }

    #[test]
    fn tone_maps_bright_hlg_without_clipping() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-hdr-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A test pattern lifted 8x in linear light, so its highlights reach
        // far past SDR white as a sunny iPhone HDR shot does.
        let src = dir.join("hlg.mov");
        let gain = "colorchannelmixer=rr=2:gg=2:bb=2";
        Tool::Ffmpeg
            .run([
                "-y".to_string(),
                "-v".into(),
                "error".into(),
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                "testsrc2=size=640x480:rate=30:duration=1".into(),
                "-vf".into(),
                format!(
                    "zscale=tin=bt709:pin=bt709:min=bt709:t=linear:p=bt2020:npl=100,\
                     format=gbrpf32le,{gain},{gain},{gain},\
                     zscale=t=arib-std-b67:m=bt2020nc:npl=100,format=yuv420p10le"
                ),
                "-c:v".into(),
                "libx264".into(),
                "-profile:v".into(),
                "high10".into(),
                "-color_trc".into(),
                "arib-std-b67".into(),
                "-color_primaries".into(),
                "bt2020".into(),
                "-colorspace".into(),
                "bt2020nc".into(),
                src.to_string_lossy().into_owned(),
            ])
            .unwrap();
        let dst = dir.join("out.mov");
        normalize(&src, &dst).unwrap();
        let summary = stream_summary(&dst);
        let saturation = first_frame_stat(&dst, "SATAVG");
        let brightest = first_frame_stat(&dst, "YHIGH");
        std::fs::remove_dir_all(&dir).unwrap();

        assert!(summary.contains("color_primaries=bt709"), "{summary}");
        // Read as SDR the colours fall to ~60; tone-mapped they come back
        // near the pattern's own ~113, without blowing highlights out.
        assert!(saturation > 90.0, "{saturation}");
        assert!(brightest < 235.0, "{brightest}");
    }
}
