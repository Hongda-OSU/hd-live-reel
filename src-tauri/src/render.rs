//! Turns a project into video: the low-res preview and the final export
//! come from the same composition.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use crate::ffmpeg::{self, Composition, Fill, Grade, Look, Music, Quality, Segment, Shape, Title};
use crate::project::{self as p, Audio, AudioMode, Filter, Preset, Project, TransitionKind};

/// What FFmpeg should join for `project`.
pub fn composition(project: &Project) -> Result<Composition, String> {
    project.validate()?;
    if project.clips.is_empty() {
        return Err("add some Live Photos first".into());
    }
    let clips = project
        .clips
        .iter()
        .map(|clip| {
            let path = clip
                .normalized_path
                .clone()
                .ok_or_else(|| format!("{}: not prepared yet", clip.id))?;
            let whole = clip.trim_start <= 0.0 && clip.trim_end >= clip.duration - 1e-6;
            Ok(Segment {
                path,
                duration: clip.duration,
                trim: (!whole).then_some((clip.trim_start, clip.trim_end)),
                muted: clip.muted,
                crop_offset: clip.crop_offset,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let title = &project.title;
    let has_text = !title.text.trim().is_empty() || !title.subtitle.trim().is_empty();
    let title = match (&title.text_image, has_text) {
        (Some(image), true) => Some(Title {
            image: image.clone(),
            show_for: title.show_for,
            fade_out: title.fade_out,
        }),
        _ => None,
    };
    let transition = match project.transition.kind {
        TransitionKind::None => 0.0,
        TransitionKind::Fade => project.transition.duration,
    };
    Ok(Composition {
        clips,
        shape: match project.output.aspect {
            p::Aspect::Portrait => Shape::Portrait,
            p::Aspect::Landscape => Shape::Landscape,
        },
        fill: match project.output.fill {
            p::Fill::Crop => Fill::Crop,
            p::Fill::Black => Fill::Black,
            p::Fill::Blur => Fill::Blur,
        },
        transition,
        grade: grade(&project.filter),
        title,
        music: music(&project.audio),
    })
}

/// The music track, if a music mode is on and a track has been chosen.
fn music(audio: &Audio) -> Option<Music> {
    let original = match audio.mode {
        AudioMode::Original => return None,
        AudioMode::Music => None,
        AudioMode::Mix => Some(audio.original_volume),
    };
    Some(Music {
        path: audio.music_path.clone()?,
        volume: audio.music_volume,
        original,
    })
}

fn grade(filter: &Filter) -> Grade {
    Grade {
        look: match filter.preset {
            Preset::None => None,
            Preset::Forest => Some(Look::Forest),
            Preset::River => Some(Look::River),
            Preset::Golden => Some(Look::Golden),
        },
        brightness: filter.brightness,
        contrast: filter.contrast,
        saturation: filter.saturation,
    }
}

pub fn render(project: &Project, quality: Quality, out: &Path) -> Result<(), String> {
    let composition = composition(project)?;
    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    ffmpeg::compose(&composition, quality, out).map_err(|e| e.to_string())
}

/// The error a cancelled export returns, so callers can tell it apart
/// from a failure.
pub const CANCELLED: &str = "cancelled";

/// Renders the full-quality video into `out`, reporting progress from 0
/// to 1. It is written under a hidden name and renamed when complete, so
/// the folder never holds a half-written video, even after a cancel.
pub fn export(
    project: &Project,
    out: &Path,
    cancel: &AtomicBool,
    on_progress: impl FnMut(f64),
) -> Result<(), String> {
    let composition = composition(project)?;
    let dir = out.parent().ok_or("export path has no folder")?;
    let name = out.file_name().ok_or("export path has no file name")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let partial = dir.join(format!(".{}.partial.mp4", name.to_string_lossy()));
    let result =
        ffmpeg::compose_with_progress(&composition, Quality::Export, &partial, cancel, on_progress);
    match result {
        Ok(()) => std::fs::rename(&partial, out).map_err(|e| e.to_string()),
        Err(error) => {
            let _ = std::fs::remove_file(&partial);
            Err(match error {
                ffmpeg::Error::Cancelled => CANCELLED.into(),
                error => error.to_string(),
            })
        }
    }
}

/// Stores the frontend-rendered title PNG under `<cache>/titles/`, named by
/// content so unchanged titles reuse the same file.
pub fn save_title_image(png: &[u8], cache: &Path) -> Result<PathBuf, String> {
    let mut hasher = DefaultHasher::new();
    png.hash(&mut hasher);
    let path = cache
        .join("titles")
        .join(format!("{:016x}.png", hasher.finish()));
    if !path.is_file() {
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(&path, png).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Where exports go: the project's chosen folder, which must still exist
/// (an unplugged drive should fail rather than save somewhere else), or
/// `default`, created if needed.
pub fn export_dir(chosen: Option<&Path>, default: &Path) -> Result<PathBuf, String> {
    match chosen {
        Some(dir) if dir.is_dir() => Ok(dir.to_path_buf()),
        Some(dir) => Err(format!("export folder not found: {}", dir.display())),
        None => {
            std::fs::create_dir_all(default).map_err(|e| e.to_string())?;
            Ok(default.to_path_buf())
        }
    }
}

/// `<dir>/<name>.mp4`, or `<name> 2.mp4` and so on if taken.
pub fn export_path(dir: &Path, name: &str) -> PathBuf {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|c| if matches!(c, '/' | ':') { '-' } else { c })
        .collect();
    let stem = if cleaned.is_empty() {
        "Untitled".to_string()
    } else {
        cleaned
    };
    let mut path = dir.join(format!("{stem}.mp4"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} {n}.mp4"));
        n += 1;
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{Clip, ClipKind, Source};

    fn clip(trim: (f64, f64), muted: bool) -> Clip {
        Clip {
            id: "c".into(),
            source: Source::Iphone,
            kind: ClipKind::LivePhoto,
            asset_id: None,
            still_path: None,
            video_path: "/o/a.MOV".into(),
            normalized_path: Some("/c/a.norm.mov".into()),
            taken_at: None,
            duration: 2.0,
            trim_start: trim.0,
            trim_end: trim.1,
            muted,
            crop_offset: 0.5,
            ai_score: None,
            ai_reason: None,
        }
    }

    #[test]
    fn whole_clips_are_not_trimmed() {
        let project = Project {
            clips: vec![clip((0.0, 2.0), false), clip((0.3, 1.5), true)],
            ..Default::default()
        };
        let composition = composition(&project).unwrap();
        assert_eq!(composition.clips[0].trim, None);
        assert_eq!(composition.clips[1].trim, Some((0.3, 1.5)));
        assert!(composition.clips[1].muted);
        assert_eq!(composition.title, None);
    }

    #[test]
    fn title_needs_text_and_an_image() {
        let mut project = Project {
            clips: vec![clip((0.0, 2.0), false)],
            ..Default::default()
        };
        project.title.text_image = Some("/c/t.png".into());
        assert_eq!(composition(&project).unwrap().title, None, "no text");

        project.title.text = "Indiana".into();
        project.title.fade_out = 0.3;
        let title = composition(&project).unwrap().title.unwrap();
        assert_eq!(title.image, Path::new("/c/t.png"));
        assert_eq!((title.show_for, title.fade_out), (1.0, 0.3));
    }

    #[test]
    fn filter_becomes_the_grade() {
        let mut project = Project {
            clips: vec![clip((0.0, 2.0), false)],
            ..Default::default()
        };
        assert_eq!(composition(&project).unwrap().grade, Grade::default());

        project.filter.preset = Preset::River;
        project.filter.contrast = 1.2;
        let grade = composition(&project).unwrap().grade;
        assert_eq!(grade.look, Some(Look::River));
        assert_eq!(grade.contrast, 1.2);
    }

    #[test]
    fn music_needs_a_mode_and_a_track() {
        let mut project = Project {
            clips: vec![clip((0.0, 2.0), false), clip((0.5, 1.5), false)],
            ..Default::default()
        };
        project.audio.mode = AudioMode::Music;
        assert_eq!(composition(&project).unwrap().music, None, "no track yet");

        project.audio.music_path = Some("/c/music/song.flac".into());
        assert_eq!(composition(&project).unwrap().music.unwrap().original, None);

        project.audio.mode = AudioMode::Mix;
        project.audio.original_volume = 1.5;
        assert_eq!(
            composition(&project).unwrap().music.unwrap().original,
            Some(1.5)
        );

        project.audio.mode = AudioMode::Original;
        assert_eq!(composition(&project).unwrap().music, None);
    }

    #[test]
    fn fade_transition_cross_dissolves_the_joins() {
        let mut project = Project {
            clips: vec![clip((0.0, 2.0), false), clip((0.0, 2.0), false)],
            ..Default::default()
        };
        project.transition.duration = 0.3;
        assert_eq!(composition(&project).unwrap().transition, 0.0, "type none");

        project.transition.kind = TransitionKind::Fade;
        let composition = composition(&project).unwrap();
        assert_eq!(composition.transition, 0.3);
        assert!((composition.length() - 3.7).abs() < 1e-9);
    }

    #[test]
    fn empty_or_unprepared_projects_are_refused() {
        assert!(composition(&Project::default()).is_err());
        let mut unprepared = clip((0.0, 2.0), false);
        unprepared.normalized_path = None;
        let project = Project {
            clips: vec![unprepared],
            ..Default::default()
        };
        assert!(composition(&project).unwrap_err().contains("not prepared"));
    }

    #[test]
    fn title_images_are_stored_by_content() {
        let cache = std::env::temp_dir().join(format!("hd-live-reel-title-{}", std::process::id()));
        let a = save_title_image(b"png-a", &cache).unwrap();
        let again = save_title_image(b"png-a", &cache).unwrap();
        let b = save_title_image(b"png-b", &cache).unwrap();
        let bytes = std::fs::read(&a).unwrap();
        std::fs::remove_dir_all(&cache).unwrap();
        assert_eq!(a, again);
        assert_ne!(a, b);
        assert_eq!(bytes, b"png-a");
    }

    #[test]
    fn export_names_avoid_clashes() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = export_path(&dir, "Turkey Run");
        std::fs::write(&first, b"").unwrap();
        let second = export_path(&dir, "Turkey Run");
        let unnamed = export_path(&dir, "  ");
        let slashed = export_path(&dir, "9/28: Lake");
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(first.file_name().unwrap(), "Turkey Run.mp4");
        assert_eq!(second.file_name().unwrap(), "Turkey Run 2.mp4");
        assert_eq!(unnamed.file_name().unwrap(), "Untitled.mp4");
        assert_eq!(slashed.file_name().unwrap(), "9-28- Lake.mp4");
    }

    /// A project with one real, normalized 2-second clip under `dir`.
    fn exportable(dir: &Path) -> Project {
        let src = dir.join("src.mov");
        ffmpeg::Tool::Ffmpeg
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
        let norm = dir.join("norm.mov");
        ffmpeg::normalize(&src, &norm).unwrap();
        let mut clip = clip((0.0, 2.0), false);
        clip.normalized_path = Some(norm);
        Project {
            clips: vec![clip],
            ..Default::default()
        }
    }

    /// Files in `dir`, hidden ones included.
    fn listing(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn chosen_folder_must_exist_but_the_default_is_created() {
        let dir = std::env::temp_dir().join(format!("hd-live-reel-dirs-{}", std::process::id()));
        let default = dir.join("Movies/HD Live Reel");
        let chosen = dir.join("Trips");
        let missing = export_dir(Some(&chosen), &default);
        std::fs::create_dir_all(&chosen).unwrap();
        let found = export_dir(Some(&chosen), &default);
        let created = export_dir(None, &default);
        let default_exists = default.is_dir();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!(missing.unwrap_err().contains("not found"));
        assert_eq!(found.unwrap(), chosen);
        assert_eq!(created.unwrap(), default);
        assert!(default_exists);
    }

    #[test]
    fn export_reports_progress_and_leaves_only_the_video() {
        let dir = std::env::temp_dir().join(format!(
            "hd-live-reel-export-progress-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let project = exportable(&dir);
        let out_dir = dir.join("out");
        let mut progress = Vec::new();
        export(
            &project,
            &out_dir.join("Trip.mp4"),
            &AtomicBool::new(false),
            |p| progress.push(p),
        )
        .unwrap();
        let files = listing(&out_dir);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(files, ["Trip.mp4"]);
        assert!(!progress.is_empty());
        assert!(
            progress.iter().all(|p| (0.0..=1.0).contains(p)),
            "{progress:?}"
        );
        assert!(*progress.last().unwrap() > 0.95, "{progress:?}");
    }

    #[test]
    fn cancelled_export_leaves_nothing_behind() {
        let dir =
            std::env::temp_dir().join(format!("hd-live-reel-cancelled-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let project = exportable(&dir);
        let out_dir = dir.join("out");
        let cancel = AtomicBool::new(false);
        let result = export(&project, &out_dir.join("Trip.mp4"), &cancel, |_| {
            cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        });
        let files = listing(&out_dir);
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(result, Err(CANCELLED.to_string()));
        assert!(files.is_empty(), "{files:?}");
    }
}
