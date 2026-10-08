//! FFmpeg / ffprobe sidecars and the processing chain built on them.

mod compose;
pub mod normalize;
mod probe;
mod tool;

pub use compose::{compose, Composition, Quality, Segment, Title};
pub use normalize::{loudness, normalize, uncropped_frame, Normalized};
pub use probe::{probe, MediaInfo, VideoInfo};
pub use tool::{Error, Tool};
