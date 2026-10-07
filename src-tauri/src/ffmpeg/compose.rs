//! Joins normalized clips into the final video, with an optional opening
//! title. Preview and export share this graph; only the tail differs.

use std::path::{Path, PathBuf};

use super::normalize::FPS;
use super::{Error, Tool};

/// Ceiling for the final limiter (about -1 dBFS).
const LIMIT: f64 = 0.89;

/// A transparent PNG, sized like the output, laid over the first frames.
#[derive(Debug, Clone, PartialEq)]
pub struct Title {
    pub image: PathBuf,
    /// Seconds the title stays on screen, starting at the first frame.
    pub show_for: f64,
    /// Seconds of fade at the end of `show_for`; 0 cuts it off.
    pub fade_out: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    /// Half resolution, fastest encode: for checking edits in the app.
    Preview,
    /// Full 1080p H.264 + AAC, ready to send over WeChat.
    Export,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Composition {
    /// Normalized clips in playback order.
    pub clips: Vec<PathBuf>,
    pub title: Option<Title>,
}

pub fn compose(composition: &Composition, quality: Quality, out: &Path) -> Result<(), Error> {
    if composition.clips.is_empty() {
        return Err(Error::Parse("nothing to compose".into()));
    }
    Tool::Ffmpeg.run(args(composition, quality, out))?;
    Ok(())
}

fn args(composition: &Composition, quality: Quality, out: &Path) -> Vec<String> {
    let mut args: Vec<String> = vec!["-y".into(), "-v".into(), "error".into()];
    for clip in &composition.clips {
        args.extend(["-i".into(), clip.to_string_lossy().into_owned()]);
    }
    if let Some(title) = &composition.title {
        // Loop the still for exactly `show_for` so a fade has frames to work on.
        args.extend([
            "-loop".into(),
            "1".into(),
            "-framerate".into(),
            FPS.to_string(),
            "-t".into(),
            title.show_for.to_string(),
            "-i".into(),
            title.image.to_string_lossy().into_owned(),
        ]);
    }
    args.extend(["-filter_complex".into(), filter_graph(composition, quality)]);
    args.extend(["-map", "[v]", "-map", "[a]"].map(String::from));
    args.extend(encoder_args(quality));
    args.push(out.to_string_lossy().into_owned());
    args
}

fn filter_graph(composition: &Composition, quality: Quality) -> String {
    let n = composition.clips.len();
    let inputs: String = (0..n).map(|i| format!("[{i}:v][{i}:a]")).collect();
    let mut graph = format!("{inputs}concat=n={n}:v=1:a=1[joined][a0];");

    let mut video = "joined".to_string();
    if let Some(title) = &composition.title {
        let fade = if title.fade_out > 0.0 {
            format!(
                ",fade=t=out:st={}:d={}:alpha=1",
                title.show_for - title.fade_out,
                title.fade_out
            )
        } else {
            String::new()
        };
        graph.push_str(&format!(
            "[{n}:v]format=rgba{fade}[title];[{video}][title]overlay=0:0:eof_action=pass[titled];"
        ));
        video = "titled".into();
    }

    match quality {
        Quality::Preview => graph.push_str(&format!("[{video}]scale=iw/2:ih/2[v];")),
        Quality::Export => graph.push_str(&format!("[{video}]null[v];")),
    }
    graph.push_str(&format!("[a0]alimiter=limit={LIMIT}[a]"));
    graph
}

fn encoder_args(quality: Quality) -> Vec<String> {
    let video: &[&str] = match quality {
        Quality::Preview => &["-c:v", "libx264", "-preset", "ultrafast", "-crf", "28"],
        Quality::Export => &[
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "18",
            "-profile:v",
            "high",
        ],
    };
    let common: &[&str] = &[
        "-pix_fmt",
        "yuv420p",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-colorspace",
        "bt709",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
    ];
    video.iter().chain(common).map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg::normalize;

    fn composition(title: Option<Title>) -> Composition {
        Composition {
            clips: vec!["a.mov".into(), "b.mov".into()],
            title,
        }
    }

    fn title(fade_out: f64) -> Title {
        Title {
            image: "title.png".into(),
            show_for: 1.0,
            fade_out,
        }
    }

    #[test]
    fn joins_clips_without_title() {
        assert_eq!(
            filter_graph(&composition(None), Quality::Export),
            "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[joined][a0];\
             [joined]null[v];[a0]alimiter=limit=0.89[a]"
        );
    }

    #[test]
    fn overlays_title_after_the_clips() {
        assert_eq!(
            filter_graph(&composition(Some(title(0.0))), Quality::Export),
            "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[joined][a0];\
             [2:v]format=rgba[title];[joined][title]overlay=0:0:eof_action=pass[titled];\
             [titled]null[v];[a0]alimiter=limit=0.89[a]"
        );
        let args = args(
            &composition(Some(title(0.0))),
            Quality::Export,
            "out.mp4".as_ref(),
        );
        let title_input = args.iter().position(|a| a == "title.png").unwrap();
        assert_eq!(
            args[title_input - 7..title_input],
            ["-loop", "1", "-framerate", "30", "-t", "1", "-i"]
        );
    }

    #[test]
    fn fades_title_alpha_when_asked() {
        let graph = filter_graph(&composition(Some(title(0.3))), Quality::Export);
        assert!(graph.contains("[2:v]format=rgba,fade=t=out:st=0.7:d=0.3:alpha=1[title]"));
    }

    #[test]
    fn preview_shares_the_graph_and_only_scales_down() {
        let export = filter_graph(&composition(Some(title(0.0))), Quality::Export);
        let preview = filter_graph(&composition(Some(title(0.0))), Quality::Preview);
        assert_eq!(
            preview,
            export.replace("[titled]null[v]", "[titled]scale=iw/2:ih/2[v]")
        );
        assert!(encoder_args(Quality::Preview).contains(&"ultrafast".to_string()));
    }

    /// Per-frame PSNR of `a` against `b`; identical frames give infinity.
    fn frame_psnr(a: &Path, b: &Path) -> Vec<f64> {
        let output = Tool::Ffmpeg
            .run([
                "-v".as_ref(),
                "error".as_ref(),
                "-i".as_ref(),
                a.as_os_str(),
                "-i".as_ref(),
                b.as_os_str(),
                "-lavfi".as_ref(),
                "psnr=stats_file=-".as_ref(),
                "-f".as_ref(),
                "null".as_ref(),
                "-".as_ref(),
            ] as [&std::ffi::OsStr; 11])
            .unwrap();
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| {
                line.split_whitespace()
                    .find_map(|f| f.strip_prefix("psnr_avg:"))
            })
            .map(|value| value.parse().unwrap_or(f64::INFINITY))
            .collect()
    }

    #[test]
    fn composes_generated_clips() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-compose-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut clips = Vec::new();
        for (i, size) in ["640x480", "480x640"].iter().enumerate() {
            let src = dir.join(format!("src{i}.mov"));
            Tool::Ffmpeg
                .run([
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("testsrc2=size={size}:rate=30:duration=2"),
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=duration=2",
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "pcm_s16le",
                    src.to_str().unwrap(),
                ])
                .unwrap();
            let norm = dir.join(format!("norm{i}.mov"));
            normalize(&src, &norm, 0.5).unwrap();
            clips.push(norm);
        }
        let png = dir.join("title.png");
        Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=white@0.5:s=1080x1920,format=rgba",
                "-frames:v",
                "1",
                png.to_str().unwrap(),
            ])
            .unwrap();

        let plain = dir.join("plain.mp4");
        let titled = dir.join("titled.mp4");
        let preview = dir.join("preview.mp4");
        let without = Composition {
            clips: clips.clone(),
            title: None,
        };
        let with = Composition {
            clips,
            title: Some(Title {
                image: png,
                show_for: 1.0,
                fade_out: 0.0,
            }),
        };
        compose(&without, Quality::Export, &plain).unwrap();
        compose(&with, Quality::Export, &titled).unwrap();
        compose(&with, Quality::Preview, &preview).unwrap();

        let info = crate::ffmpeg::probe(&titled).unwrap();
        let preview_info = crate::ffmpeg::probe(&preview).unwrap();
        let psnr = frame_psnr(&titled, &plain);
        std::fs::remove_dir_all(&dir).unwrap();

        assert!((info.duration - 4.0).abs() < 0.05, "{}", info.duration);
        assert!(info.has_audio);
        let video = info.video.unwrap();
        assert_eq!((video.width, video.height), (1080, 1920));
        let preview_video = preview_info.video.unwrap();
        assert_eq!((preview_video.width, preview_video.height), (540, 960));

        // Title on exactly the first second (30 frames). Both files are lossy
        // encodes, so frames after it match closely rather than bit for bit.
        assert_eq!(psnr.len(), 120);
        assert!(psnr[..30].iter().all(|&p| p < 20.0), "{:?}", &psnr[..30]);
        assert!(psnr[30..].iter().all(|&p| p > 35.0), "{:?}", &psnr[30..]);
    }
}
