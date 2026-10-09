use std::ffi::OsStr;
use std::fmt;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

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

    /// Runs FFmpeg, calling `on_time` with the seconds of output written so
    /// far. Checks `cancel` at every progress report (5 a second) and, once
    /// it is set, kills FFmpeg and returns `Error::Cancelled`.
    pub fn run_with_progress<I, S>(
        self,
        args: I,
        cancel: &AtomicBool,
        mut on_time: impl FnMut(f64),
    ) -> Result<(), Error>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut child = Command::new(self.path())
            .args(["-progress", "pipe:1", "-nostats", "-stats_period", "0.2"])
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|source| Error::Spawn { tool: self, source })?;
        // Drain stderr on its own thread so a chatty FFmpeg cannot block
        // on a full pipe while we wait on stdout.
        let mut stderr = child.stderr.take().expect("piped");
        let errors = std::thread::spawn(move || {
            let mut text = String::new();
            let _ = stderr.read_to_string(&mut text);
            text
        });

        let stdout = child.stdout.take().expect("piped");
        for line in BufReader::new(stdout).lines() {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(Error::Cancelled);
            }
            if let Some(seconds) = line.ok().as_deref().and_then(progress_seconds) {
                on_time(seconds);
            }
        }
        let status = child
            .wait()
            .map_err(|source| Error::Spawn { tool: self, source })?;
        let stderr = errors.join().unwrap_or_default();
        if cancel.load(Ordering::SeqCst) {
            return Err(Error::Cancelled);
        }
        if !status.success() {
            return Err(Error::Failed {
                tool: self,
                stderr: tail(&stderr, 20),
            });
        }
        Ok(())
    }
}

/// Seconds of output from an FFmpeg `-progress` line such as
/// `out_time_us=1234567`; other keys, and `N/A` early on, give `None`.
fn progress_seconds(line: &str) -> Option<f64> {
    let micros: f64 = line.strip_prefix("out_time_us=")?.trim().parse().ok()?;
    Some(micros / 1_000_000.0)
}

#[derive(Debug)]
pub enum Error {
    Spawn {
        tool: Tool,
        source: std::io::Error,
    },
    Failed {
        tool: Tool,
        stderr: String,
    },
    Parse(String),
    /// Stopped on request before finishing.
    Cancelled,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Spawn { tool, source } => write!(f, "could not start {}: {source}", tool.name()),
            Error::Failed { tool, stderr } => write!(f, "{} failed:\n{stderr}", tool.name()),
            Error::Parse(message) => write!(f, "could not parse output: {message}"),
            Error::Cancelled => write!(f, "cancelled"),
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
    fn reads_progress_lines() {
        assert_eq!(progress_seconds("out_time_us=1500000"), Some(1.5));
        assert_eq!(progress_seconds("out_time_us=N/A"), None);
        assert_eq!(progress_seconds("progress=continue"), None);
    }

    /// Ten seconds of test pattern, encoded slowly enough to report progress.
    fn slow_encode(out: &std::path::Path) -> Vec<String> {
        [
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=1280x720:rate=30:duration=10",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
        ]
        .iter()
        .map(|s| s.to_string())
        .chain([out.to_string_lossy().into_owned()])
        .collect()
    }

    #[test]
    fn reports_progress_until_done() {
        let out =
            std::env::temp_dir().join(format!("hd-live-reel-progress-{}.mp4", std::process::id()));
        let mut times = Vec::new();
        Tool::Ffmpeg
            .run_with_progress(slow_encode(&out), &AtomicBool::new(false), |t| {
                times.push(t)
            })
            .unwrap();
        let _ = std::fs::remove_file(&out);

        assert!(times.len() >= 2, "{times:?}");
        assert!(times.windows(2).all(|w| w[0] <= w[1]), "{times:?}");
        assert!((times.last().unwrap() - 10.0).abs() < 0.1, "{times:?}");
    }

    #[test]
    fn stops_when_cancelled() {
        let out =
            std::env::temp_dir().join(format!("hd-live-reel-cancel-{}.mp4", std::process::id()));
        let cancel = AtomicBool::new(false);
        let started = std::time::Instant::now();
        let result = Tool::Ffmpeg.run_with_progress(slow_encode(&out), &cancel, |_| {
            cancel.store(true, Ordering::SeqCst);
        });
        let _ = std::fs::remove_file(&out);

        assert!(matches!(result, Err(Error::Cancelled)), "{result:?}");
        assert!(started.elapsed().as_secs_f64() < 3.0, "stopped promptly");
    }

    #[test]
    fn tail_keeps_last_lines() {
        assert_eq!(tail("a\nb\nc", 2), "b\nc");
        assert_eq!(tail("a", 5), "a");
    }
}
