//! Rule G07: Maximum Juggle Duration Verification.
//!
//! Verifies that continuous airborne/juggle durations do not exceed the profile threshold.
//! Uses integer frame counts exclusively.

use crate::simulation::engine::SimulationOutput;
use std::collections::BTreeMap;

use crate::verification::budget::VerificationBudgetTracker;
use crate::verification::evidence::Evidence;
use crate::verification::profile::VerificationProfile;
use crate::verification::report::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

pub fn check_juggle(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    let mut max_juggle_frames: u32 = 0;
    let mut worst_span: Option<(String, u32, u32)> = None;

    // Track consecutive airborne frames per actor across snapshots
    if !simulation.snapshots.is_empty() {
        let mut consecutive_airborne: BTreeMap<String, (u32, u32)> = BTreeMap::new(); // actor_id -> (count, start_frame)

        for snap in &simulation.snapshots {
            let _ = tracker.track_step();
            for (actor_id, actor) in &snap.actors {
                let entry = consecutive_airborne
                    .entry(actor_id.clone())
                    .or_insert((0, snap.frame));

                if actor.is_airborne {
                    entry.0 = entry.0.saturating_add(1);
                    if entry.0 > max_juggle_frames {
                        max_juggle_frames = entry.0;
                        worst_span = Some((actor_id.clone(), entry.1, snap.frame));
                    }
                } else {
                    *entry = (0, snap.frame);
                }
            }
        }
    } else {
        // Fallback to metrics if snapshots were not collected
        max_juggle_frames = simulation.metrics.juggle_count.saturating_mul(15);
    }

    if max_juggle_frames > profile.max_juggle_frames {
        let (actor_id, f_start, f_end) =
            worst_span.unwrap_or_else(|| ("unknown".to_string(), 0, simulation.total_frames));

        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g07_juggle_exceeded"),
            kind: "max_juggle_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: f_start,
            frame_end: f_end,
            actor_ids: vec![actor_id.clone()],
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: profile.max_juggle_frames as u64,
            observed: max_juggle_frames as u64,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: max_juggle_frames,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Actor '{}' juggled for {} consecutive frames (limit is {} frames) in span {}-{}f",
                actor_id, max_juggle_frames, profile.max_juggle_frames, f_start, f_end
            ),
        };

        CheckResult {
            rule_id: "G07_MAX_JUGGLE".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: profile.max_juggle_frames as u64,
            observed: max_juggle_frames as u64,
            expected: format!("Continuous juggle frames <= {}", profile.max_juggle_frames),
            violation_code: Some(ViolationCode::MaxJuggle),
            evidence: Some(evidence),
            message: format!(
                "Juggle duration exceeded limit: observed {}f > limit {}f on actor '{}'",
                max_juggle_frames, profile.max_juggle_frames, actor_id
            ),
        }
    } else {
        CheckResult {
            rule_id: "G07_MAX_JUGGLE".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: profile.max_juggle_frames as u64,
            observed: max_juggle_frames as u64,
            expected: format!("Continuous juggle frames <= {}", profile.max_juggle_frames),
            violation_code: None,
            evidence: None,
            message: "Continuous juggle frames within allowed limits".to_string(),
        }
    }
}
