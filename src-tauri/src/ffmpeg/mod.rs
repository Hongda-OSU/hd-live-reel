//! FFmpeg / ffprobe sidecars and the processing chain built on them.

mod compose;
mod grade;
mod music;
pub mod normalize;
mod probe;
mod tool;

pub use compose::{compose, Composition, Music, Quality, Segment, Title};
pub use grade::{Grade, Look};
pub use music::{normalize_music, MUSIC_LUFS};
pub use normalize::{loudness, normalize, uncropped_frame, Normalized};
pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
