//! Joins normalized clips into the final video, with an optional opening
//! title. Preview and export share this graph; only the tail differs.

use std::path::{Path, PathBuf};

use super::normalize::{EDGE_FADE, FPS};
use super::{Error, Grade, Tool};

/// Ceiling for the final limiter (about -1 dBFS).
const LIMIT: f64 = 0.89;
/// Music fades in briefly and out over the last seconds of the video.
const MUSIC_FADE_IN: f64 = 0.3;
const MUSIC_FADE_OUT: f64 = 2.0;

/// A transparent PNG, sized like the output, laid over the first frames.
#[derive(Debug, Clone, PartialEq)]
pub struct Title {
    pub image: PathBuf,
    /// Seconds the title stays on screen, starting at the first frame.
    pub show_for: f64,
    /// Seconds of fade at the end of `show_for`; 0 cuts it off.
    pub fade_out: f64,
}

/// A normalized music track laid under, or instead of, the clips' sound.
#[derive(Debug, Clone, PartialEq)]
pub struct Music {
    pub path: PathBuf,
    /// Linear gain; 1 keeps the normalized level.
    pub volume: f64,
    /// Linear gain for the clips' own sound underneath; `None` drops it.
    pub original: Option<f64>,
    /// Length of the video in seconds, where the music fades out. The
    /// track loops if it is shorter.
    pub length: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    /// Half resolution, fastest encode: for checking edits in the app.
    Preview,
    /// Full 1080p H.264 + AAC, ready to send over WeChat.
    Export,
}

/// One normalized clip and how much of it to use.
#[derive(Debug, Clone, PartialEq)]
pub struct Segment {
    pub path: PathBuf,
    /// Start and end, in seconds into the clip; `None` keeps all of it.
    pub trim: Option<(f64, f64)>,
    pub muted: bool,
}

impl From<PathBuf> for Segment {
    fn from(path: PathBuf) -> Self {
        Self {
            path,
            trim: None,
            muted: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Composition {
    /// Normalized clips in playback order.
    pub clips: Vec<Segment>,
    pub grade: Grade,
    pub title: Option<Title>,
    pub music: Option<Music>,
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
        args.extend(["-i".into(), clip.path.to_string_lossy().into_owned()]);
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
    if let Some(music) = &composition.music {
        args.extend([
            "-stream_loop".into(),
            "-1".into(),
            "-i".into(),
            music.path.to_string_lossy().into_owned(),
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
    let mut graph = String::new();
    let mut inputs = String::new();
    for (i, segment) in composition.clips.iter().enumerate() {
        let (video, audio) = segment_filters(i, segment, &mut graph);
        inputs.push_str(&format!("[{video}][{audio}]"));
    }
    graph.push_str(&format!("{inputs}concat=n={n}:v=1:a=1[joined][a0];"));

    let mut video = "joined".to_string();
    // The preview shrinks first so grading touches a quarter of the pixels;
    // grading is per pixel, so the order does not change the look.
    let shrink = match quality {
        Quality::Preview => ",scale=iw/2:ih/2",
        Quality::Export => "",
    };
    if quality == Quality::Preview {
        graph.push_str(&format!("[{video}]scale=iw/2:ih/2[small];"));
        video = "small".into();
    }
    // Graded before the title goes on, so the text keeps its colour.
    if let Some(grade) = composition.grade.filter() {
        graph.push_str(&format!("[{video}]{grade}[graded];"));
        video = "graded".into();
    }
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
            "[{n}:v]format=rgba{shrink}{fade}[title];\
             [{video}][title]overlay=0:0:eof_action=pass[titled];"
        ));
        video = "titled".into();
    }

    graph.push_str(&format!("[{video}]null[v];"));

    let mut audio = "a0";
    if let Some(music) = &composition.music {
        let input = n + usize::from(composition.title.is_some());
        let fade = MUSIC_FADE_OUT.min(music.length / 2.0);
        graph.push_str(&format!(
            "[{input}:a]volume={:.3},afade=t=in:d={MUSIC_FADE_IN},\
             afade=t=out:st={:.3}:d={fade:.3}[music];",
            music.volume,
            music.length - fade,
        ));
        // Silenced rather than dropped: the clips' track still sets the
        // length, since the looped music never ends.
        graph.push_str(&format!(
            "[a0]volume={:.3}[orig];[orig][music]amix=inputs=2:duration=first:normalize=0[mixed];",
            music.original.unwrap_or(0.0),
        ));
        audio = "mixed";
    }
    graph.push_str(&format!("[{audio}]alimiter=limit={LIMIT}[a]"));
    graph
}

/// Adds trim / mute chains for input `i` to `graph` and returns the labels
/// to feed into concat. Untouched clips go in as they are.
fn segment_filters(i: usize, segment: &Segment, graph: &mut String) -> (String, String) {
    if segment.trim.is_none() && !segment.muted {
        return (format!("{i}:v"), format!("{i}:a"));
    }
    let mut video = format!("{i}:v");
    let mut audio_chain = Vec::new();
    if let Some((start, end)) = segment.trim {
        // Snap to whole frames so audio and video cut at the same instant.
        let (start, end) = (snap(start), snap(end));
        graph.push_str(&format!(
            "[{i}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS[s{i}v];"
        ));
        video = format!("s{i}v");
        // Trimming cuts off the click-guard fades normalize added; redo them.
        audio_chain.push(format!(
            "atrim=start={start}:end={end},asetpts=PTS-STARTPTS,\
             afade=t=in:d={EDGE_FADE},afade=t=out:st={:.4}:d={EDGE_FADE}",
            end - start - EDGE_FADE
        ));
    }
    if segment.muted {
        audio_chain.push("volume=0".into());
    }
    graph.push_str(&format!("[{i}:a]{}[s{i}a];", audio_chain.join(",")));
    (video, format!("s{i}a"))
}

fn snap(seconds: f64) -> f64 {
    (seconds * FPS as f64).round() / FPS as f64
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
            grade: Grade::default(),
            music: None,
            clips: vec![PathBuf::from("a.mov").into(), PathBuf::from("b.mov").into()],
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
    fn trims_and_mutes_only_the_segments_that_ask() {
        let composition = Composition {
            grade: Grade::default(),
            music: None,
            clips: vec![
                Segment {
                    path: "a.mov".into(),
                    trim: Some((0.51, 1.5)),
                    muted: false,
                },
                PathBuf::from("b.mov").into(),
                Segment {
                    path: "c.mov".into(),
                    trim: None,
                    muted: true,
                },
            ],
            title: None,
        };
        assert_eq!(
            filter_graph(&composition, Quality::Export),
            "[0:v]trim=start=0.5:end=1.5,setpts=PTS-STARTPTS[s0v];\
             [0:a]atrim=start=0.5:end=1.5,asetpts=PTS-STARTPTS,\
             afade=t=in:d=0.03,afade=t=out:st=0.9700:d=0.03[s0a];\
             [2:a]volume=0[s2a];\
             [s0v][s0a][1:v][1:a][2:v][s2a]concat=n=3:v=1:a=1[joined][a0];\
             [joined]null[v];[a0]alimiter=limit=0.89[a]"
        );
    }

    #[test]
    fn preview_shrinks_video_and_title_first() {
        let graph = filter_graph(&composition(Some(title(0.0))), Quality::Preview);
        assert_eq!(
            graph,
            "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[joined][a0];\
             [joined]scale=iw/2:ih/2[small];\
             [2:v]format=rgba,scale=iw/2:ih/2[title];\
             [small][title]overlay=0:0:eof_action=pass[titled];\
             [titled]null[v];[a0]alimiter=limit=0.89[a]"
        );
        assert!(encoder_args(Quality::Preview).contains(&"ultrafast".to_string()));
    }

    #[test]
    fn grades_before_the_title() {
        let mut graded = composition(Some(title(0.0)));
        graded.grade.saturation = 0.5;
        let eq = "eq=brightness=0.000:contrast=1.000:saturation=0.500";
        assert!(filter_graph(&graded, Quality::Export).contains(&format!(
            "[joined]{eq}[graded];[2:v]format=rgba[title];[graded][title]overlay"
        )));
        assert!(filter_graph(&graded, Quality::Preview).contains(&format!("[small]{eq}[graded];")));
    }

    fn music(original: Option<f64>) -> Music {
        Music {
            path: "song.flac".into(),
            volume: 0.8,
            original,
            length: 4.0,
        }
    }

    #[test]
    fn music_loops_after_the_title_input_and_fades_out() {
        let mut with_music = composition(Some(title(0.0)));
        with_music.music = Some(music(None));
        let graph = filter_graph(&with_music, Quality::Export);
        assert!(graph.ends_with(
            "[3:a]volume=0.800,afade=t=in:d=0.3,afade=t=out:st=2.000:d=2.000[music];\
             [a0]volume=0.000[orig];[orig][music]amix=inputs=2:duration=first:normalize=0[mixed];\
             [mixed]alimiter=limit=0.89[a]"
        ));
        let args = args(&with_music, Quality::Export, "out.mp4".as_ref());
        let input = args.iter().position(|a| a == "song.flac").unwrap();
        assert_eq!(args[input - 3..input], ["-stream_loop", "-1", "-i"]);

        // Without a title the music is the input right after the clips.
        let mut mixed = composition(None);
        mixed.music = Some(music(Some(1.5)));
        let graph = filter_graph(&mixed, Quality::Export);
        assert!(graph.contains("[2:a]volume=0.800"));
        assert!(graph.contains("[a0]volume=1.500[orig]"));
    }

    #[test]
    fn short_music_fades_over_half_the_video() {
        let mut short = composition(None);
        short.music = Some(Music {
            length: 1.0,
            ..music(None)
        });
        assert!(filter_graph(&short, Quality::Export).contains("afade=t=out:st=0.500:d=0.500"));
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

    /// Integrated loudness of `path` between `from` and `to` seconds.
    fn loudness_between(path: &Path, from: f64, to: f64) -> Option<f64> {
        let output = Tool::Ffmpeg
            .run([
                "-hide_banner".to_string(),
                "-i".into(),
                path.to_string_lossy().into_owned(),
                "-af".into(),
                format!("atrim={from}:{to},ebur128=framelog=quiet"),
                "-f".into(),
                "null".into(),
                "-".into(),
            ])
            .unwrap();
        String::from_utf8_lossy(&output.stderr)
            .lines()
            .rev()
            .find_map(|l| l.trim().strip_prefix("I:"))
            .and_then(|rest| rest.split_whitespace().next()?.parse().ok())
            .filter(|lufs: &f64| lufs.is_finite())
    }

    #[test]
    fn trims_and_mutes_generated_clips() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-trim-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut clips = Vec::new();
        for i in 0..2 {
            let src = dir.join(format!("src{i}.mov"));
            Tool::Ffmpeg
                .run([
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc2=size=640x480:rate=30:duration=2",
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
        let out = dir.join("out.mp4");
        let composition = Composition {
            grade: Grade::default(),
            music: None,
            clips: vec![
                Segment {
                    path: clips[0].clone(),
                    trim: Some((0.5, 1.5)),
                    muted: false,
                },
                Segment {
                    path: clips[1].clone(),
                    trim: None,
                    muted: true,
                },
            ],
            title: None,
        };
        compose(&composition, Quality::Preview, &out).unwrap();
        let info = crate::ffmpeg::probe(&out).unwrap();
        let first = loudness_between(&out, 0.1, 0.9);
        let second = loudness_between(&out, 1.2, 2.8);
        std::fs::remove_dir_all(&dir).unwrap();

        assert!((info.duration - 3.0).abs() < 0.05, "{}", info.duration);
        assert!(first.is_some_and(|lufs| lufs > -40.0), "{first:?}");
        // ebur128 reports silence as its gating floor, -70 LUFS.
        assert!(second.is_none_or(|lufs| lufs <= -70.0), "muted: {second:?}");
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
        let clips: Vec<Segment> = clips.into_iter().map(Segment::from).collect();
        let without = Composition {
            grade: Grade::default(),
            music: None,
            clips: clips.clone(),
            title: None,
        };
        let with = Composition {
            grade: Grade::default(),
            music: None,
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

    #[test]
    fn mixes_looped_music_under_generated_clips() {
        let dir =
            std::env::temp_dir().join(format!("hd-live-reel-music-mix-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut clips = Vec::new();
        for i in 0..2 {
            let src = dir.join(format!("src{i}.mov"));
            Tool::Ffmpeg
                .run([
                    "-y",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc2=size=640x480:rate=30:duration=2",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440:duration=2,volume=-20dB",
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "pcm_s16le",
                    src.to_str().unwrap(),
                ])
                .unwrap();
            let norm = dir.join(format!("norm{i}.mov"));
            normalize(&src, &norm, 0.5).unwrap();
            clips.push(Segment::from(norm));
        }
        // 1.5 s of music under 4 s of video: it has to loop.
        let song = dir.join("song.wav");
        Tool::Ffmpeg
            .run([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=660:duration=1.5,volume=-6dB",
                song.to_str().unwrap(),
            ])
            .unwrap();
        let track = dir.join("song.flac");
        crate::ffmpeg::normalize_music(&song, &track).unwrap();

        let render = |original: Option<f64>, volume: f64, name: &str| {
            let out = dir.join(name);
            let composition = Composition {
                clips: clips.clone(),
                grade: Grade::default(),
                title: None,
                music: Some(Music {
                    path: track.clone(),
                    volume,
                    original,
                    length: 4.0,
                }),
            };
            compose(&composition, Quality::Preview, &out).unwrap();
            out
        };
        let only_music = render(None, 1.0, "music.mp4");
        let only_clips = render(Some(1.0), 0.0, "clips.mp4");
        let duration = crate::ffmpeg::probe(&only_music).unwrap().duration;
        let middle = loudness_between(&only_music, 0.5, 1.5).unwrap();
        let looped = loudness_between(&only_music, 2.0, 2.4).unwrap();
        let tail = loudness_between(&only_music, 3.8, 4.0);
        let clips_lufs = loudness_between(&only_clips, 0.5, 1.5).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!((duration - 4.0).abs() < 0.1, "{duration}");
        assert!((middle - crate::ffmpeg::MUSIC_LUFS).abs() < 2.0, "{middle}");
        assert!(
            looped > middle - 6.0,
            "music keeps playing after 1.5 s: {looped}"
        );
        assert!(
            tail.is_none_or(|t| t < middle - 10.0),
            "fades out: {tail:?}"
        );
        assert!(
            clips_lufs < middle - 8.0,
            "clips' own sound sits lower: {clips_lufs}"
        );
    }
}
