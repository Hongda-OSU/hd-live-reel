//! Colour grading applied to the joined video: a preset look, then the
//! brightness / contrast / saturation sliders. Built only from FFmpeg's own
//! filters; the preset numbers are hand-picked starting points.

/// A preset look; the frontend calls these 林间 / 水色 / 暖阳.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Look {
    /// Richer, deeper greens.
    Forest,
    /// Clearer, slightly cooler water and sky.
    River,
    /// Warm late-afternoon light.
    Golden,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Grade {
    pub look: Option<Look>,
    /// Added to luma; 0 leaves it alone.
    pub brightness: f64,
    /// 1 leaves it alone.
    pub contrast: f64,
    /// 1 leaves it alone.
    pub saturation: f64,
}

impl Default for Grade {
    fn default() -> Self {
        Self {
            look: None,
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
        }
    }
}

impl Grade {
    /// The filter chain, or `None` when nothing would change, so an
    /// ungraded video skips the RGB round trip entirely.
    pub fn filter(&self) -> Option<String> {
        let mut chain: Vec<String> = Vec::new();
        if let Some(look) = self.look {
            chain.push(look_filter(look).into());
        }
        let sliders = [self.brightness, self.contrast - 1.0, self.saturation - 1.0];
        if sliders.iter().any(|v| v.abs() > 1e-6) {
            chain.push(format!(
                "eq=brightness={:.3}:contrast={:.3}:saturation={:.3}",
                self.brightness, self.contrast, self.saturation
            ));
        }
        (!chain.is_empty()).then(|| chain.join(","))
    }
}

/// colorbalance shifts shadows (s), midtones (m) and highlights (h) per
/// channel; vibrance lifts muted colours more than vivid ones.
fn look_filter(look: Look) -> &'static str {
    match look {
        Look::Forest => {
            "vibrance=intensity=0.2,\
             colorbalance=rs=-0.02:gs=0.03:bs=-0.01:rm=-0.03:gm=0.04:bm=-0.02,\
             eq=contrast=1.05:gamma=0.97"
        }
        Look::River => {
            "colorbalance=rs=-0.04:bs=0.05:rm=-0.02:bm=0.03:rh=-0.02:bh=0.03,\
             vibrance=intensity=0.15,\
             eq=contrast=1.04:brightness=0.02"
        }
        Look::Golden => {
            "colorbalance=rs=0.04:bs=-0.05:rm=0.06:gm=0.02:bm=-0.05:rh=0.04:bh=-0.03,\
             eq=contrast=1.03:saturation=1.08"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffmpeg::Tool;

    #[test]
    fn untouched_grade_adds_nothing() {
        assert_eq!(Grade::default().filter(), None);
    }

    #[test]
    fn sliders_alone_use_eq() {
        let grade = Grade {
            saturation: 0.5,
            ..Grade::default()
        };
        assert_eq!(
            grade.filter().unwrap(),
            "eq=brightness=0.000:contrast=1.000:saturation=0.500"
        );
    }

    #[test]
    fn sliders_follow_the_look() {
        let grade = Grade {
            look: Some(Look::Golden),
            brightness: 0.1,
            ..Grade::default()
        };
        let filter = grade.filter().unwrap();
        assert!(filter.starts_with("colorbalance="), "{filter}");
        assert!(filter.ends_with("eq=brightness=0.100:contrast=1.000:saturation=1.000"));
    }

    /// Mean of a signalstats value over the first frame of a test pattern
    /// run through `filter`.
    fn stat(filter: Option<String>, key: &str) -> f64 {
        let chain = match filter {
            Some(f) => format!("{f},format=yuv420p,signalstats"),
            None => "signalstats".into(),
        };
        let output = Tool::Ffmpeg
            .run([
                "-hide_banner".into(),
                "-f".into(),
                "lavfi".into(),
                "-i".into(),
                "testsrc2=size=320x240:rate=1:duration=1,format=yuv420p".into(),
                "-vf".into(),
                format!("{chain},metadata=print:key=lavfi.signalstats.{key}"),
                "-frames:v".into(),
                "1".into(),
                "-f".into(),
                "null".into(),
                "-".into(),
            ] as [String; 12])
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        stderr
            .lines()
            .find_map(|line| line.split(&format!("{key}=")).nth(1))
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or_else(|| panic!("no {key} in: {stderr}"))
    }

    #[test]
    fn looks_and_sliders_move_colours_the_right_way() {
        let look = |look| {
            Grade {
                look: Some(look),
                ..Grade::default()
            }
            .filter()
        };
        // V is red minus luma and U blue minus luma, so V - U rises as a
        // picture gets warmer.
        let warmth = |filter: Option<String>| stat(filter.clone(), "VAVG") - stat(filter, "UAVG");
        let plain = warmth(None);
        assert!(warmth(look(Look::Golden)) > plain + 2.0);
        assert!(warmth(look(Look::River)) < plain);

        let plain_sat = stat(None, "SATAVG");
        let faded = Grade {
            saturation: 0.5,
            ..Grade::default()
        };
        assert!(stat(faded.filter(), "SATAVG") < plain_sat * 0.6);
    }
}
