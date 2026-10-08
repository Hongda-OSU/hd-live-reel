//! Turns a project into video: the low-res preview and the final export
//! come from the same composition.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::ffmpeg::{self, Composition, Grade, Look, Quality, Segment, Title};
use crate::project::{Filter, Preset, Project};

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
                trim: (!whole).then_some((clip.trim_start, clip.trim_end)),
                muted: clip.muted,
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
    Ok(Composition {
        clips,
        grade: grade(&project.filter),
        title,
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

/// `<dir>/<name>.mp4`, or `<name> 2.mp4` and so on if taken.
pub fn export_path(dir: &Path, name: &str) -> PathBuf {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|c| if matches!(c, '/' | ':') { '-' } else { c })
        .collect();
    let stem = if cleaned.is_empty() {
        "HD Live Reel".to_string()
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
        assert_eq!(unnamed.file_name().unwrap(), "HD Live Reel.mp4");
        assert_eq!(slashed.file_name().unwrap(), "9-28- Lake.mp4");
    }
}
