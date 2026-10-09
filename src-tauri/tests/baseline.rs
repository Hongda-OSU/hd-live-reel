//! Runs the whole chain on real Live Photos and checks it against the video
//! the original compose.py prototype produced. Needs personal media, so it is
//! ignored by default:
//!
//!   HD_LIVE_REEL_SAMPLES=<dir with *.mov + devils-lake-baseline.mp4> \
//!   [HD_LIVE_REEL_TITLE=<title.png>] \
//!   cargo test --manifest-path src-tauri/Cargo.toml --test baseline -- --ignored

use std::path::{Path, PathBuf};

use hd_live_reel_lib::ffmpeg::{
    compose, loudness, normalize, probe, Composition, Fill, Grade, Quality, Segment, Shape, Title,
};

const BASELINE: &str = "devils-lake-baseline.mp4";

#[test]
#[ignore = "needs HD_LIVE_REEL_SAMPLES"]
fn matches_compose_py_baseline() {
    let samples =
        PathBuf::from(std::env::var("HD_LIVE_REEL_SAMPLES").expect("set HD_LIVE_REEL_SAMPLES"));
    let work = std::env::temp_dir().join(format!("hd-live-reel-baseline-{}", std::process::id()));
    std::fs::create_dir_all(&work).unwrap();

    // compose.py ordered clips by capture time.
    let mut sources: Vec<(String, PathBuf)> = std::fs::read_dir(&samples)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("mov"))
        })
        .map(|path| {
            (
                probe(&path).unwrap().creation_time.unwrap_or_default(),
                path,
            )
        })
        .collect();
    sources.sort();

    let clips: Vec<Segment> = sources
        .iter()
        .map(|(_, src)| {
            let dst = work
                .join(src.file_stem().unwrap())
                .with_extension("norm.mov");
            let duration = normalize(src, &dst).unwrap().duration;
            Segment::whole(dst, duration)
        })
        .collect();
    let title = std::env::var("HD_LIVE_REEL_TITLE").ok().map(|image| Title {
        image: image.into(),
        show_for: 1.0,
        fade_out: 0.0,
    });

    let out = work.join("out.mp4");
    compose(
        &Composition {
            clips,
            shape: Shape::Portrait,
            fill: Fill::Crop,
            transition: 0.0,
            grade: Grade::default(),
            title,
            music: None,
        },
        Quality::Export,
        &out,
    )
    .unwrap();

    let ours = summary(&out);
    let theirs = summary(&samples.join(BASELINE));
    let psnr = frame_psnr_after(&out, &samples.join(BASELINE), TITLE_END);
    let worst = psnr.iter().copied().fold(f64::INFINITY, f64::min);
    let mean = psnr.iter().sum::<f64>() / psnr.len() as f64;
    let below = psnr.iter().filter(|p| **p < MIN_PSNR).count();
    println!(
        "ours:     {ours:?}\nbaseline: {theirs:?}\n\
         frame PSNR: worst {worst:.1} dB, mean {mean:.1} dB, {below}/{} below {MIN_PSNR}",
        psnr.len()
    );
    // Normalized copies of personal media; don't leave them in /tmp.
    std::fs::remove_dir_all(&work).unwrap();

    assert_eq!(ours.size, theirs.size);
    assert!((ours.duration - theirs.duration).abs() <= 1.0 / 30.0 + 1e-6);
    assert!((ours.lufs - theirs.lufs).abs() <= 0.5);
    // Not bit-identical since cropping moved after the intermediate's own
    // encode, but no frame may differ visibly.
    assert!(!psnr.is_empty());
    assert!(worst > MIN_PSNR, "worst frame {worst:.1} dB");
}

/// The baseline has its title until here; frames before it are skipped
/// unless HD_LIVE_REEL_TITLE supplies the same PNG.
const TITLE_END: f64 = 1.5;
/// Around 38 dB and up counts as visually lossless. Measured on the nine
/// sample clips: mean 43.5 dB, worst frame 39.1 dB; a wrong colour or crop
/// falls far below this.
const MIN_PSNR: f64 = 38.0;

/// Per-frame PSNR of `a` against `b` from `from` seconds on.
fn frame_psnr_after(a: &Path, b: &Path, from: f64) -> Vec<f64> {
    let output = std::process::Command::new(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../binaries/ffmpeg-aarch64-apple-darwin"),
    )
    .args(["-v", "error", "-i"])
    .arg(a)
    .arg("-i")
    .arg(b)
    .args([
        "-lavfi",
        &format!(
            "[0:v]trim=start={from},setpts=PTS-STARTPTS[a];\
             [1:v]trim=start={from},setpts=PTS-STARTPTS[b];[a][b]psnr=stats_file=-"
        ),
        "-f",
        "null",
        "-",
    ])
    .output()
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

#[derive(Debug)]
struct Summary {
    size: (u32, u32),
    duration: f64,
    lufs: f64,
}

fn summary(path: &Path) -> Summary {
    let info = probe(path).unwrap();
    let video = info.video.unwrap();
    Summary {
        size: (video.width, video.height),
        duration: info.duration,
        lufs: loudness(path).unwrap().unwrap(),
    }
}
