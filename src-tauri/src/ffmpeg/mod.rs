//! FFmpeg / ffprobe sidecars and the processing chain built on them.

pub mod normalize;
mod probe;
mod tool;

pub use normalize::{loudness, normalize, Normalized};
pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
