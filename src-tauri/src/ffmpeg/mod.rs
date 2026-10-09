//! FFmpeg / ffprobe sidecars and the processing chain built on them.

mod compose;
mod grade;
mod music;
pub mod normalize;
mod probe;
mod tool;

pub use compose::{
    compose, compose_with_progress, Composition, Fill, Music, Quality, Segment, Shape, Title,
};
pub use grade::{Grade, Look};
pub use music::{normalize_music, MUSIC_LUFS};
pub use normalize::{loudness, normalize, still_frame, Normalized, FPS};
pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
