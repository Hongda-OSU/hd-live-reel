//! AI selection: picks a reel's worth of items from the stretch of the
//! library the user chose, by Vision scores, keeping one picture of each
//! near-identical burst and spreading the picks over the scenes.

use serde::{Deserialize, Serialize};

use crate::iphone::MediaKind;

/// A new scene starts after this long without a picture, in seconds. The
/// picker must split days into scenes the same way.
pub const SCENE_GAP: i64 = 30 * 60;
/// Feature-print distance under which two pictures count as the same shot.
/// Measured on real bursts: 0.30 near-identical, 0.45 the same view
/// slightly turned, 0.60 a different framing. Lake views from one outing
/// sit around 0.45, and a hand-picked reel kept several of them, so only
/// true repeats are dropped.
pub const DUPLICATE_DISTANCE: f32 = 0.35;
/// Below this `detail` a picture is mostly empty sky or wall; Vision still
/// scores those well. An empty sky measured 1.3, hand-picked shots 11+.
pub const PLAIN_DETAIL: f32 = 4.0;
const UTILITY_PENALTY: f64 = 0.3;
const PLAIN_PENALTY: f64 = 0.5;
/// Nothing scoring below this is picked, even to fill the target.
pub const MIN_VALUE: f64 = 0.2;
/// Expected length on the reel, in seconds: Live Photos run about 2 s and
/// long videos start as a 5 s slice.
const LIVE_PHOTO_SECONDS: f64 = 2.0;
const VIDEO_SECONDS: f64 = 5.0;

/// What `photos-helper score` says about one picture.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    /// -1 (poor) to 1 (great).
    pub aesthetics: f32,
    /// Screenshots, receipts, maps and the like.
    pub utility: bool,
    pub detail: f32,
    pub feature_print: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: String,
    pub kind: MediaKind,
    /// ISO 8601 UTC, as `photos-helper list` prints it.
    pub taken_at: Option<String>,
    pub score: Score,
}

/// Why an item was or wasn't picked; the frontend words it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Reason {
    /// The best of its scene.
    BestInScene,
    HighScore,
    /// Nearly the same picture as `of`, which scored higher.
    Duplicate {
        of: String,
    },
    /// Mostly empty, such as a plain sky.
    Plain,
    /// Looks like a screenshot, a map or a document.
    Utility,
    /// Fine, but the target was filled by better ones.
    Cut,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub id: String,
    pub picked: bool,
    /// Aesthetics after penalties; stored as the clip's `aiScore`.
    pub value: f64,
    pub reason: Reason,
}

/// Picks about `target_seconds` of items, returning a verdict for every
/// candidate in capture order.
///
/// Each scene gets picks in proportion to how many pictures were taken
/// there, best first, skipping near-duplicates of better pictures.
pub fn select(candidates: &[Candidate], target_seconds: f64) -> Vec<Verdict> {
    let mut order: Vec<usize> = (0..candidates.len()).collect();
    let time = |i: usize| candidates[i].taken_at.as_deref().and_then(epoch_seconds);
    // Undated ones last, as a scene of their own.
    order.sort_by_key(|&i| (time(i).is_none(), time(i), i));
    let mut scene_of = vec![0; candidates.len()];
    let mut scene_sizes = vec![0usize];
    for pair in order.windows(2) {
        let split = match (time(pair[0]), time(pair[1])) {
            (Some(a), Some(b)) => b - a > SCENE_GAP,
            (a, b) => a.is_some() != b.is_some(),
        };
        if split {
            scene_sizes.push(0);
        }
        scene_of[pair[1]] = scene_sizes.len() - 1;
    }
    for &i in &order {
        scene_sizes[scene_of[i]] += 1;
    }

    let value: Vec<f64> = candidates.iter().map(|c| value(&c.score)).collect();
    let mut by_value: Vec<usize> = (0..candidates.len()).collect();
    by_value.sort_by(|&a, &b| value[b].total_cmp(&value[a]).then(a.cmp(&b)));

    // One representative per burst: the best, then whatever isn't close
    // to an earlier representative.
    let mut reasons: Vec<Option<Reason>> = vec![None; candidates.len()];
    let mut representatives: Vec<usize> = Vec::new();
    for &i in &by_value {
        let print = &candidates[i].score.feature_print;
        match representatives
            .iter()
            .find(|&&r| distance(print, &candidates[r].score.feature_print) < DUPLICATE_DISTANCE)
        {
            Some(&r) => {
                reasons[i] = Some(Reason::Duplicate {
                    of: candidates[r].id.clone(),
                })
            }
            None => representatives.push(i),
        }
    }

    // Hand out picks to whichever scene is furthest below its share.
    let mut queues: Vec<Vec<usize>> = vec![Vec::new(); scene_sizes.len()];
    for &i in &representatives {
        if value[i] >= MIN_VALUE {
            queues[scene_of[i]].push(i);
        }
    }
    let mut next = vec![0; queues.len()];
    let mut filled = vec![0.0; queues.len()];
    let mut total = 0.0;
    let mut picked = vec![false; candidates.len()];
    while total < target_seconds {
        let Some(scene) = (0..queues.len())
            .filter(|&s| next[s] < queues[s].len())
            .min_by(|&a, &b| {
                let share = |s: usize| filled[s] / scene_sizes[s] as f64;
                share(a)
                    .total_cmp(&share(b))
                    .then(value[queues[b][next[b]]].total_cmp(&value[queues[a][next[a]]]))
            })
        else {
            break;
        };
        let i = queues[scene][next[scene]];
        let seconds = match candidates[i].kind {
            MediaKind::Video => VIDEO_SECONDS,
            _ => LIVE_PHOTO_SECONDS,
        };
        reasons[i] = Some(if next[scene] == 0 {
            Reason::BestInScene
        } else {
            Reason::HighScore
        });
        picked[i] = true;
        next[scene] += 1;
        filled[scene] += seconds;
        total += seconds;
    }

    order
        .into_iter()
        .map(|i| {
            let score = &candidates[i].score;
            let reason = reasons[i]
                .clone()
                .unwrap_or(if score.detail < PLAIN_DETAIL {
                    Reason::Plain
                } else if score.utility {
                    Reason::Utility
                } else {
                    Reason::Cut
                });
            Verdict {
                id: candidates[i].id.clone(),
                picked: picked[i],
                value: value[i],
                reason,
            }
        })
        .collect()
}

/// Aesthetics, less penalties for what Vision overrates.
fn value(score: &Score) -> f64 {
    let mut value = score.aesthetics as f64;
    if score.utility {
        value -= UTILITY_PENALTY;
    }
    if score.detail < PLAIN_DETAIL {
        value -= PLAIN_PENALTY;
    }
    value
}

fn distance(a: &[f32], b: &[f32]) -> f32 {
    a.iter()
        .zip(b)
        .map(|(x, y)| (x - y) * (x - y))
        .sum::<f32>()
        .sqrt()
}

/// Seconds since 1970 of "YYYY-MM-DDTHH:MM:SSZ" (fractions ignored).
fn epoch_seconds(iso: &str) -> Option<i64> {
    let bytes = iso.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[10] != b'T' {
        return None;
    }
    let field = |range: std::ops::Range<usize>| iso.get(range)?.parse::<i64>().ok();
    let (y, m, d) = (field(0..4)?, field(5..7)?, field(8..10)?);
    let (hh, mm, ss) = (field(11..13)?, field(14..16)?, field(17..19)?);
    // Days from 1970-01-01 to y-m-d (Howard Hinnant's days_from_civil).
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + hh * 3600 + mm * 60 + ss)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A Live Photo at `minute` past 10:00 whose feature print is the unit
    /// vector at `angle`; prints 0.6 rad apart are 0.59 apart, not bursts.
    fn photo(id: &str, minute: i64, aesthetics: f32, angle: f32) -> Candidate {
        Candidate {
            id: id.into(),
            kind: MediaKind::LivePhoto,
            taken_at: Some(format!(
                "2026-09-27T{:02}:{:02}:00Z",
                10 + minute / 60,
                minute % 60
            )),
            score: Score {
                aesthetics,
                utility: false,
                detail: 15.0,
                feature_print: vec![angle.cos(), angle.sin()],
            },
        }
    }

    fn picked(verdicts: &[Verdict]) -> Vec<&str> {
        verdicts
            .iter()
            .filter(|v| v.picked)
            .map(|v| v.id.as_str())
            .collect()
    }

    #[test]
    fn reads_helper_timestamps() {
        assert_eq!(epoch_seconds("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(epoch_seconds("2026-09-27T15:18:01Z"), Some(1_790_522_281));
        assert_eq!(epoch_seconds("2024-02-29T12:00:00Z"), Some(1_709_208_000));
        assert_eq!(epoch_seconds("yesterday"), None);
    }

    #[test]
    fn keeps_the_best_of_a_burst() {
        let verdicts = select(
            &[
                photo("a", 0, 0.5, 0.0),
                photo("a2", 1, 0.6, 0.1),
                photo("b", 2, 0.4, 0.9),
            ],
            4.0,
        );
        assert_eq!(picked(&verdicts), ["a2", "b"]);
        assert_eq!(verdicts[0].reason, Reason::Duplicate { of: "a2".into() });
        assert_eq!(verdicts[1].reason, Reason::BestInScene);
    }

    #[test]
    fn spreads_picks_over_scenes_by_size() {
        // Six pictures in the morning, two in the afternoon (5 h later).
        let mut candidates: Vec<Candidate> = (0..6)
            .map(|i| {
                photo(
                    &format!("m{i}"),
                    i * 5,
                    0.3 + i as f32 * 0.05,
                    i as f32 * 0.6,
                )
            })
            .collect();
        candidates.push(photo("p0", 300, 0.9, 4.0));
        candidates.push(photo("p1", 305, 0.8, 5.0));
        let verdicts = select(&candidates, 8.0);

        // Four picks: the afternoon's best, then the morning's, then by share.
        let chosen = picked(&verdicts);
        assert_eq!(chosen.len(), 4);
        assert!(chosen.contains(&"p0"));
        assert_eq!(chosen.iter().filter(|id| id.starts_with('m')).count(), 3);
        assert_eq!(
            chosen[..3],
            ["m3", "m4", "m5"],
            "best of the morning, in time order"
        );
    }

    #[test]
    fn plain_and_utility_pictures_are_marked_down() {
        let mut sky = photo("sky", 0, 0.7, 0.0);
        sky.score.detail = 1.3;
        let mut map = photo("map", 1, 0.6, 1.0);
        map.score.utility = true;
        let lake = photo("lake", 2, 0.45, 2.0);
        let verdicts = select(&[sky, map, lake], 2.0);

        assert_eq!(picked(&verdicts), ["lake"]);
        assert_eq!(verdicts[0].reason, Reason::Plain);
        assert_eq!(verdicts[1].reason, Reason::Utility);
        assert!((verdicts[0].value - 0.2).abs() < 1e-6);
    }

    #[test]
    fn never_pads_with_poor_pictures() {
        let verdicts = select(
            &[photo("good", 0, 0.5, 0.0), photo("poor", 1, 0.1, 1.0)],
            60.0,
        );
        assert_eq!(picked(&verdicts), ["good"]);
        assert_eq!(verdicts[1].reason, Reason::Cut);
    }

    #[test]
    fn videos_count_for_more_time() {
        let mut video = photo("v", 0, 0.9, 0.0);
        video.kind = MediaKind::Video;
        let verdicts = select(
            &[video, photo("a", 1, 0.5, 1.0), photo("b", 2, 0.4, 2.0)],
            6.0,
        );
        assert_eq!(picked(&verdicts), ["v", "a"]);
    }

    #[test]
    fn reasons_serialize_for_the_frontend() {
        let json = serde_json::to_value(Reason::Duplicate { of: "x".into() }).unwrap();
        assert_eq!(json, serde_json::json!({"type": "duplicate", "of": "x"}));
        let json = serde_json::to_value(Reason::BestInScene).unwrap();
        assert_eq!(json, serde_json::json!({"type": "bestInScene"}));
    }
}
