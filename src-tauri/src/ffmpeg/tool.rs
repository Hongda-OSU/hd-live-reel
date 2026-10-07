use std::ffi::OsStr;
use std::fmt;
use std::path::PathBuf;
use std::process::{Command, Output};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Ffmpeg,
    Ffprobe,
}

impl Tool {
    pub fn name(self) -> &'static str {
        match self {
            Tool::Ffmpeg => "ffmpeg",
            Tool::Ffprobe => "ffprobe",
        }
    }

    pub fn path(self) -> PathBuf {
        crate::sidecar::path(self.name())
    }

    /// Runs the tool to completion; a non-zero exit becomes `Error::Failed`.
    pub fn run<I, S>(self, args: I) -> Result<Output, Error>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let output = Command::new(self.path())
            .args(args)
            .output()
            .map_err(|source| Error::Spawn { tool: self, source })?;
        if !output.status.success() {
            return Err(Error::Failed {
                tool: self,
                stderr: tail(&String::from_utf8_lossy(&output.stderr), 20),
            });
        }
        Ok(output)
    }
}

#[derive(Debug)]
pub enum Error {
    Spawn { tool: Tool, source: std::io::Error },
    Failed { tool: Tool, stderr: String },
    Parse(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Spawn { tool, source } => write!(f, "could not start {}: {source}", tool.name()),
            Error::Failed { tool, stderr } => write!(f, "{} failed:\n{stderr}", tool.name()),
            Error::Parse(message) => write!(f, "could not parse output: {message}"),
        }
    }
}

impl std::error::Error for Error {}

/// FFmpeg's stderr can be long; the last lines carry the actual error.
fn tail(text: &str, lines: usize) -> String {
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_the_sidecar() {
        let output = Tool::Ffmpeg.run(["-hide_banner", "-version"]).unwrap();
        assert!(String::from_utf8_lossy(&output.stdout).starts_with("ffmpeg version"));
    }

    #[test]
    fn reports_failure_with_stderr() {
        let err = Tool::Ffprobe.run(["/nonexistent.mov"]).unwrap_err();
        assert!(
            matches!(
                err,
                Error::Failed {
                    tool: Tool::Ffprobe,
                    ..
                }
            ),
            "{err}"
        );
    }

    #[test]
    fn tail_keeps_last_lines() {
        assert_eq!(tail("a\nb\nc", 2), "b\nc");
        assert_eq!(tail("a", 5), "a");
    }
}
