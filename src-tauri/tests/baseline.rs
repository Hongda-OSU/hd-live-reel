//! Runs the whole chain on real Live Photos and checks it against the video
//! the original compose.py prototype produced. Needs personal media, so it is
//! ignored by default:
//!
//!   HD_LIVE_REEL_SAMPLES=<dir with *.mov + devils-lake-baseline.mp4> \
//!   [HD_LIVE_REEL_TITLE=<title.png>] \
//!   cargo test --manifest-path src-tauri/Cargo.toml --test baseline -- --ignored

use std::path::{Path, PathBuf};

use hd_live_reel_lib::ffmpeg::{
    compose, loudness, normalize, probe, Composition, Grade, Quality, Segment, Title,
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
            let duration = normalize(src, &dst, 0.5).unwrap().duration;
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
    println!("ours:     {ours:?}\nbaseline: {theirs:?}");
    // Normalized copies of personal media; don't leave them in /tmp.
    std::fs::remove_dir_all(&work).unwrap();

    assert_eq!(ours.size, theirs.size);
    assert!((ours.duration - theirs.duration).abs() <= 1.0 / 30.0 + 1e-6);
    assert!((ours.lufs - theirs.lufs).abs() <= 0.5);
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
