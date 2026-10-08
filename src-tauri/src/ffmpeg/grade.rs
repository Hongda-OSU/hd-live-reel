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

/// Each look works on its own colours so the rest of the picture (white
/// clouds, grey rock) keeps its colour. huesaturation edits one hue range
/// (g = greens, y = yellows, c = cyans, b = blues, r = reds); colorbalance
/// shifts shadows (s) and midtones (m) of coloured pixels only, leaving
/// greys and whites alone.
fn look_filter(look: Look) -> &'static str {
    match look {
        // Deeper, richer foliage.
        Look::Forest => {
            "huesaturation=colors=g+y:saturation=0.6:intensity=-0.12:strength=3,\
             eq=contrast=1.06"
        }
        // Clearer, brighter water and sky.
        Look::River => {
            "huesaturation=colors=c+b:saturation=0.5:intensity=0.08:strength=3,\
             eq=contrast=1.05:brightness=0.015"
        }
        // Warm light, with autumn leaves and sunsets lifted.
        Look::Golden => {
            "colorbalance=rs=0.06:bs=-0.07:rm=0.10:gm=0.02:bm=-0.10,\
             huesaturation=colors=r+y:saturation=0.3:strength=3,\
             eq=contrast=1.04"
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

    /// A signalstats value for the first frame of a test pattern run
    /// through `filter`.
    fn stat(filter: Option<String>, key: &str) -> f64 {
        stat_of("testsrc2=size=320x240:rate=1:duration=1", filter, key)
    }

    fn stat_of(source: &str, filter: Option<String>, key: &str) -> f64 {
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
                format!("{source},format=yuv420p"),
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
    fn looks_leave_white_alone() {
        for look in [Look::Forest, Look::River, Look::Golden] {
            let grade = Grade {
                look: Some(look),
                ..Grade::default()
            };
            for key in ["UAVG", "VAVG"] {
                let value = stat_of("color=white:s=64x64:d=1", grade.filter(), key);
                assert!(
                    (value - 128.0).abs() < 1.0,
                    "{look:?} tints white: {key}={value}"
                );
            }
        }
    }

    #[test]
    fn looks_change_only_their_own_colours() {
        let look = |look| {
            Grade {
                look: Some(look),
                ..Grade::default()
            }
            .filter()
        };
        let green = "color=0x3a7d2a:s=64x64:d=1";
        let blue = "color=0x3a6ea5:s=64x64:d=1";
        // colorbalance leaves pure greys alone, so warmth is checked on tan.
        let tan = "color=0x8a7a5a:s=64x64:d=1";
        let sat = |source, filter| stat_of(source, filter, "SATAVG");

        assert!(sat(green, look(Look::Forest)) > sat(green, None) * 1.2);
        assert!((sat(blue, look(Look::Forest)) - sat(blue, None)).abs() < 3.0);
        assert!(sat(blue, look(Look::River)) > sat(blue, None) * 1.2);
        assert!((sat(green, look(Look::River)) - sat(green, None)).abs() < 3.0);

        // V is red minus luma and U blue minus luma, so V - U rises as a
        // picture gets warmer.
        let warmth = |filter: Option<String>| {
            stat_of(tan, filter.clone(), "VAVG") - stat_of(tan, filter, "UAVG")
        };
        assert!(warmth(look(Look::Golden)) > warmth(None) + 1.0);
    }

    #[test]
    fn saturation_slider_fades_colour() {
        let faded = Grade {
            saturation: 0.5,
            ..Grade::default()
        };
        assert!(stat(faded.filter(), "SATAVG") < stat(None, "SATAVG") * 0.6);
    }
}
