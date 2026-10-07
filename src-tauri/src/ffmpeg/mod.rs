//! FFmpeg / ffprobe sidecars and the processing chain built on them.

mod probe;
mod tool;

pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
