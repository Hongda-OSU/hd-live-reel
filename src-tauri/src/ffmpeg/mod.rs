//! FFmpeg / ffprobe sidecars and the processing chain built on them.

mod compose;
pub mod normalize;
mod probe;
mod tool;

pub use compose::{compose, Composition, Quality, Title};
pub use normalize::{loudness, normalize, Normalized};
pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
