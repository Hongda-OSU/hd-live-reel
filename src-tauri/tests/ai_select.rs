//! Checks AI selection against a reel picked by hand. Needs personal data,
//! so it is ignored by default:
//!
//!   HD_LIVE_REEL_AI_SAMPLE=<sample.json> \
//!   cargo test --manifest-path src-tauri/Cargo.toml --test ai_select -- --ignored
//!
//! The sample holds `targetSeconds`, the hand-picked ids as `picks`, and
//! every item of the scene as `candidates` (`select::Candidate`, with the
//! `photos-helper score` output of its thumbnail as `score`).

use hd_live_reel_lib::select::{select, Candidate};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    target_seconds: f64,
    picks: Vec<String>,
    candidates: Vec<Candidate>,
}

/// Picking 9 of 36 at random matches 2.25 on average.
const MIN_MATCHES: usize = 5;

#[test]
#[ignore = "needs HD_LIVE_REEL_AI_SAMPLE"]
fn agrees_with_a_hand_picked_reel() {
    let path = std::env::var("HD_LIVE_REEL_AI_SAMPLE").expect("set HD_LIVE_REEL_AI_SAMPLE");
    let sample: Sample = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();

    let verdicts = select(&sample.candidates, sample.target_seconds);
    let chosen: Vec<&str> = verdicts
        .iter()
        .filter(|v| v.picked)
        .map(|v| v.id.as_str())
        .collect();
    let matches = chosen
        .iter()
        .filter(|id| sample.picks.iter().any(|p| p == *id))
        .count();
    for v in &verdicts {
        let hand = if sample.picks.contains(&v.id) {
            "hand"
        } else {
            ""
        };
        let ai = if v.picked { "ai" } else { "" };
        println!(
            "{:28} {:5.2} {:4} {:2} {:?}",
            v.id, v.value, hand, ai, v.reason
        );
    }
    println!("{matches}/{} of the hand picks chosen", sample.picks.len());

    assert_eq!(chosen.len(), sample.picks.len());
    assert!(matches >= MIN_MATCHES, "{matches} matches");
}
