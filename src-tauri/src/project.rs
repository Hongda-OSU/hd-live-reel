//! The editable state of one video: clips, title, filter, sound, output.
//! Saved as `project.json`-style files; the frontend owns the live copy and
//! hands it back here to persist.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Bump when the format changes, and migrate older files in `load`.
pub const VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub version: u32,
    /// Shown in the toolbar; empty until the user names it.
    pub name: String,
    /// In playback order.
    pub clips: Vec<Clip>,
    pub title: Title,
    pub filter: Filter,
    pub audio: Audio,
    pub transition: Transition,
    pub selection: Selection,
    pub output: Output,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            version: VERSION,
            name: String::new(),
            clips: Vec::new(),
            title: Title::default(),
            filter: Filter::default(),
            audio: Audio::default(),
            transition: Transition::default(),
            selection: Selection::default(),
            output: Output::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Library,
    Iphone,
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClipKind {
    LivePhoto,
    Video,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub source: Source,
    pub kind: ClipKind,
    /// Where to fetch the original again: the Photos asset id, or the
    /// iPhone's "<folder>/<name>".
    #[serde(default)]
    pub asset_id: Option<String>,
    #[serde(default)]
    pub still_path: Option<PathBuf>,
    pub video_path: PathBuf,
    #[serde(default)]
    pub normalized_path: Option<PathBuf>,
    /// ISO 8601 capture time; the default sort order.
    #[serde(default)]
    pub taken_at: Option<String>,
    /// Untrimmed length of the normalized clip, in seconds.
    pub duration: f64,
    pub trim_start: f64,
    pub trim_end: f64,
    #[serde(default)]
    pub muted: bool,
    /// 0..1 along the axis that overflows the frame; 0.5 is centred.
    #[serde(default = "centre")]
    pub crop_offset: f64,
    #[serde(default)]
    pub ai_score: Option<f64>,
    #[serde(default)]
    pub ai_reason: Option<String>,
}

fn centre() -> f64 {
    0.5
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Position {
    Top,
    Center,
    Bottom,
}

/// Stroke weight of the title lines; the frontend maps it to font weights.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Weight {
    Light,
    Regular,
    Bold,
}

/// What keeps the title readable on bright or busy footage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextStyle {
    Outline,
    Shadow,
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Title {
    pub text: String,
    pub subtitle: String,
    pub font: String,
    pub font_size: u32,
    pub color: String,
    pub position: Position,
    /// Space between title and subtitle, in pixels at 1080 wide.
    pub line_gap: f64,
    pub weight: Weight,
    pub text_style: TextStyle,
    /// Seconds on screen from the first frame.
    pub show_for: f64,
    /// Seconds of fade at the end of `show_for`; 0 cuts it off.
    pub fade_out: f64,
    /// The laid-out text as a transparent PNG, rendered by the frontend.
    pub text_image: Option<PathBuf>,
}

impl Default for Title {
    fn default() -> Self {
        Self {
            text: String::new(),
            subtitle: String::new(),
            font: "PingFang SC".into(),
            font_size: 72,
            color: "#ffffff".into(),
            position: Position::Center,
            line_gap: 18.0,
            weight: Weight::Regular,
            text_style: TextStyle::Outline,
            show_for: 1.0,
            fade_out: 0.0,
            text_image: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Preset {
    None,
    Forest,
    River,
    Golden,
}

/// Values follow FFmpeg's `eq` filter: brightness is an offset around 0,
/// contrast and saturation are factors around 1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filter {
    pub preset: Preset,
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
}

impl Default for Filter {
    fn default() -> Self {
        Self {
            preset: Preset::None,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AudioMode {
    Original,
    Music,
    Mix,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Audio {
    pub mode: AudioMode,
    pub music_path: Option<PathBuf>,
    pub music_volume: f64,
    pub original_volume: f64,
}

impl Default for Audio {
    fn default() -> Self {
        Self {
            mode: AudioMode::Original,
            music_path: None,
            music_volume: 1.0,
            original_volume: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransitionKind {
    None,
    Fade,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Transition {
    #[serde(rename = "type")]
    pub kind: TransitionKind,
    pub duration: f64,
}

impl Default for Transition {
    fn default() -> Self {
        Self {
            kind: TransitionKind::None,
            duration: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SelectionMode {
    Manual,
    Ai,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Selection {
    pub mode: SelectionMode,
    pub target_seconds: f64,
}

impl Default for Selection {
    fn default() -> Self {
        Self {
            mode: SelectionMode::Manual,
            target_seconds: 40.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Aspect {
    #[serde(rename = "9:16")]
    Portrait,
    #[serde(rename = "16:9")]
    Landscape,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Fill {
    Crop,
    Black,
    Blur,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Output {
    pub aspect: Aspect,
    pub fill: Fill,
    pub height: u32,
}

impl Default for Output {
    fn default() -> Self {
        Self {
            aspect: Aspect::Portrait,
            fill: Fill::Crop,
            height: 1080,
        }
    }
}

impl Project {
    /// Rejects states the processing chain cannot render.
    pub fn validate(&self) -> Result<(), String> {
        for clip in &self.clips {
            let id = &clip.id;
            if !(0.0 <= clip.trim_start && clip.trim_start < clip.trim_end) {
                return Err(format!("{id}: trim start must be before trim end"));
            }
            if clip.trim_end > clip.duration + 1e-6 {
                return Err(format!("{id}: trim end is past the end of the clip"));
            }
            if !(0.0..=1.0).contains(&clip.crop_offset) {
                return Err(format!("{id}: crop offset must be between 0 and 1"));
            }
        }
        if self.title.show_for <= 0.0 || self.title.fade_out < 0.0 {
            return Err("title must show for a positive time".into());
        }
        if self.title.fade_out > self.title.show_for {
            return Err("title fade is longer than the time it is shown".into());
        }
        if self.transition.duration < 0.0 {
            return Err("transition cannot be negative".into());
        }
        if self.title.line_gap < 0.0 {
            return Err("title line gap cannot be negative".into());
        }
        if self.audio.music_volume < 0.0 || self.audio.original_volume < 0.0 {
            return Err("volumes cannot be negative".into());
        }
        Ok(())
    }
}

pub fn load(path: &Path) -> Result<Project, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let project: Project =
        serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    if project.version > VERSION {
        return Err(format!(
            "{} was saved by a newer version of the app",
            path.display()
        ));
    }
    Ok(Project {
        version: VERSION,
        ..project
    })
}

/// Writes via a temporary file and rename, so a crash mid-write never
/// leaves a half-written project behind.
pub fn save(path: &Path, project: &Project) -> Result<(), String> {
    project.validate()?;
    let json = serde_json::to_string_pretty(project).map_err(|e| e.to_string())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Project files under the app's data directory, plus a pointer to the one
/// that was open last.
pub struct Store {
    dir: PathBuf,
}

impl Store {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { dir: data_dir }
    }

    /// Reopens the last project, or starts a fresh one if there is none
    /// (or it can no longer be read).
    pub fn open_last(&self) -> Result<(PathBuf, Project), String> {
        if let Some(path) = self.last_path() {
            if let Ok(project) = load(&path) {
                return Ok((path, project));
            }
        }
        self.create()
    }

    pub fn create(&self) -> Result<(PathBuf, Project), String> {
        let mut millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        let mut path = self.dir.join("projects").join(format!("{millis}.json"));
        while path.exists() {
            millis += 1;
            path = self.dir.join("projects").join(format!("{millis}.json"));
        }
        let project = Project::default();
        save(&path, &project)?;
        self.remember(&path)?;
        Ok((path, project))
    }

    pub fn remember(&self, path: &Path) -> Result<(), String> {
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        std::fs::write(
            self.dir.join("last-project"),
            path.to_string_lossy().as_bytes(),
        )
        .map_err(|e| e.to_string())
    }

    fn last_path(&self) -> Option<PathBuf> {
        std::fs::read_to_string(self.dir.join("last-project"))
            .ok()
            .map(|text| PathBuf::from(text.trim()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The example from the product doc, section 7.
    const DOC_EXAMPLE: &str = r##"{
      "clips": [
        {
          "id": "c1",
          "source": "iphone",
          "kind": "livePhoto",
          "assetId": null,
          "stillPath": "~/Library/Caches/LivePhotoVideo/c1.heic",
          "videoPath": "~/Library/Caches/LivePhotoVideo/c1.mov",
          "normalizedPath": "~/Library/Caches/LivePhotoVideo/c1.norm.mp4",
          "takenAt": "2026-09-28T10:12:03-05:00",
          "duration": 1.97,
          "trimStart": 0,
          "trimEnd": 1.97,
          "muted": false,
          "cropOffset": 0.5
        }
      ],
      "title": {
        "text": "Indiana",
        "subtitle": "Turkey Run State Park, IN",
        "font": "PingFang SC",
        "fontSize": 72,
        "color": "#ffffff",
        "position": "center",
        "showFor": 1,
        "fadeOut": 0,
        "textImage": "~/Library/Caches/LivePhotoVideo/title-text.png"
      },
      "filter": { "preset": "forest", "brightness": 0, "contrast": 1, "saturation": 1 },
      "audio": { "mode": "original", "musicPath": null, "musicVolume": 1, "originalVolume": 1 },
      "transition": { "type": "none", "duration": 0 },
      "output": { "aspect": "9:16", "fill": "crop", "height": 1080 }
    }"##;

    fn clip(trim_start: f64, trim_end: f64, crop_offset: f64) -> Clip {
        Clip {
            id: "c1".into(),
            source: Source::Iphone,
            kind: ClipKind::LivePhoto,
            asset_id: Some("202609_a/IMG_0001.HEIC".into()),
            still_path: None,
            video_path: "/c/IMG_0001.MOV".into(),
            normalized_path: None,
            taken_at: None,
            duration: 2.0,
            trim_start,
            trim_end,
            muted: false,
            crop_offset,
            ai_score: None,
            ai_reason: None,
        }
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("hd-live-reel-project-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn reads_the_doc_example() {
        let project: Project = serde_json::from_str(DOC_EXAMPLE).unwrap();
        assert_eq!(project.version, VERSION, "missing fields take defaults");
        assert_eq!(project.selection, Selection::default());
        assert_eq!(project.filter.preset, Preset::Forest);
        assert_eq!(project.output.aspect, Aspect::Portrait);
        assert_eq!(project.transition.kind, TransitionKind::None);
        assert_eq!(project.clips[0].kind, ClipKind::LivePhoto);
        assert_eq!(project.title.line_gap, 18.0, "older titles keep their look");
        assert_eq!(project.title.weight, Weight::Regular);
        assert_eq!(project.title.text_style, TextStyle::Outline);
        project.validate().unwrap();
    }

    #[test]
    fn writes_the_doc_field_names() {
        let mut project = Project::default();
        project.clips.push(clip(0.0, 2.0, 0.5));
        let json = serde_json::to_value(&project).unwrap();
        assert_eq!(json["output"]["aspect"], "9:16");
        assert_eq!(json["transition"]["type"], "none");
        assert_eq!(json["title"]["showFor"], 1.0);
        assert_eq!(json["title"]["lineGap"], 18.0);
        assert_eq!(json["title"]["textStyle"], "outline");
        assert_eq!(json["clips"][0]["cropOffset"], 0.5);
        assert_eq!(json["clips"][0]["source"], "iphone");
        assert_eq!(json["selection"]["targetSeconds"], 40.0);
    }

    #[test]
    fn clip_defaults_fill_missing_optional_fields() {
        let json = r#"{"id": "c1", "source": "file", "kind": "video", "videoPath": "/v.mov",
                       "duration": 3, "trimStart": 0, "trimEnd": 3}"#;
        let clip: Clip = serde_json::from_str(json).unwrap();
        assert_eq!(clip.crop_offset, 0.5);
        assert!(!clip.muted);
    }

    #[test]
    fn validation_catches_bad_edits() {
        let mut project = Project::default();
        project.clips.push(clip(1.0, 0.5, 0.5));
        assert!(project.validate().unwrap_err().contains("trim start"));
        project.clips[0] = clip(0.0, 2.5, 0.5);
        assert!(project.validate().unwrap_err().contains("past the end"));
        project.clips[0] = clip(0.0, 2.0, 1.5);
        assert!(project.validate().unwrap_err().contains("crop offset"));
        project.clips[0] = clip(0.0, 2.0, 0.5);
        project.title.fade_out = 2.0;
        assert!(project.validate().unwrap_err().contains("fade"));
        project.title.fade_out = 0.0;
        project.title.line_gap = -1.0;
        assert!(project.validate().unwrap_err().contains("line gap"));
        project.title.line_gap = 0.0;
        project.transition.duration = -0.1;
        assert!(project.validate().unwrap_err().contains("transition"));
    }

    #[test]
    fn saves_and_loads_round_trip() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("p.json");
        let project = Project {
            name: "Turkey Run".into(),
            clips: vec![clip(0.2, 1.8, 0.3)],
            ..Default::default()
        };

        save(&path, &project).unwrap();
        let loaded = load(&path).unwrap();
        let leftovers = std::fs::read_dir(&dir).unwrap().count();
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(loaded, project);
        assert_eq!(leftovers, 1, "no temp file left behind");
    }

    #[test]
    fn refuses_invalid_and_newer_files() {
        let dir = temp_dir("refuse");
        let path = dir.join("p.json");
        let mut bad = Project::default();
        bad.clips.push(clip(1.0, 0.5, 0.5));
        assert!(save(&path, &bad).is_err());
        assert!(!path.exists());

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, r#"{"version": 99}"#).unwrap();
        let err = load(&path).unwrap_err();
        std::fs::remove_dir_all(&dir).unwrap();
        assert!(err.contains("newer version"), "{err}");
    }

    #[test]
    fn store_reopens_the_last_project() {
        let dir = temp_dir("store");
        let store = Store::new(dir.clone());

        let (path, mut project) = store.open_last().unwrap();
        project.name = "Devil's Lake".into();
        save(&path, &project).unwrap();
        let (again_path, again) = store.open_last().unwrap();

        // A missing or unreadable last project falls back to a new one.
        std::fs::remove_file(&path).unwrap();
        let (fresh_path, fresh) = store.open_last().unwrap();
        let fresh_saved = fresh_path.is_file();
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(again_path, path);
        assert_eq!(again.name, "Devil's Lake");
        // The fresh file may reuse the deleted name if created in the same ms.
        assert!(fresh_saved);
        assert_eq!(fresh, Project::default());
    }
}
