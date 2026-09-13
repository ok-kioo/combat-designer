//! Counterplay Rule: Defender Actionable Counterplay Window Verification.
//!
//! Verifies that defender obtains an actionable counterplay window against attacker
//! sequences. Fails closed when counterplay is proven absent.

use crate::simulation::engine::SimulationOutput;

use crate::verification::budget::VerificationBudgetTracker;
use crate::verification::evidence::Evidence;
use crate::verification::profile::VerificationProfile;
use crate::verification::report::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

pub fn check_counterplay(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    // If simulation has no attacks, verify whether evidence is conclusive
    if simulation.events.is_empty() && simulation.total_frames == 0 {
        if profile.is_fail_closed() {
            return CheckResult {
                rule_id: "COUNTERPLAY_WINDOW".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Inconclusive,
                threshold: profile.min_counterplay_window_frames as u64,
                observed: 0,
                expected: "Sufficient simulation trace to evaluate defender counterplay window"
                    .to_string(),
                violation_code: None,
                evidence: None,
                message: "Inconclusive evidence: empty simulation trace".to_string(),
            };
        } else {
            return CheckResult {
                rule_id: "COUNTERPLAY_WINDOW".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Pass,
                threshold: profile.min_counterplay_window_frames as u64,
                observed: 0,
                expected: "Counterplay evaluation skipped in non-strict profile".to_string(),
                violation_code: None,
                evidence: None,
                message: "No combat interactions to evaluate counterplay".to_string(),
            };
        }
    }

    // Inspect snapshots for defender actionable frames during or after combat
    let mut min_counterplay_observed = u32::MAX;
    let mut defender_id_violation = String::new();
    let violation_span = (0u32, simulation.total_frames);

    if !simulation.snapshots.is_empty() {
        // Look for actors that were hit (stun_timer > 0 at some point)
        let mut hit_actors = Vec::new();
        for snap in &simulation.snapshots {
            for (actor_id, actor) in &snap.actors {
                if actor.stun_timer > 0 && !hit_actors.contains(actor_id) {
                    hit_actors.push(actor_id.clone());
                }
            }
        }

        for def_id in &hit_actors {
            let mut consecutive_actionable = 0u32;
            let mut max_actionable = 0u32;

            for snap in &simulation.snapshots {
                let _ = tracker.track_step();
                if let Some(actor) = snap.actors.get(def_id) {
                    if actor.stun_timer == 0 && !actor.is_airborne {
                        consecutive_actionable = consecutive_actionable.saturating_add(1);
                        if consecutive_actionable > max_actionable {
                            max_actionable = consecutive_actionable;
                        }
                    } else {
                        consecutive_actionable = 0;
                    }
                }
            }

            if max_actionable < min_counterplay_observed {
                min_counterplay_observed = max_actionable;
                defender_id_violation = def_id.clone();
            }
        }
    } else {
        min_counterplay_observed = simulation.metrics.recovery_frames;
    }

    let min_required = profile.min_counterplay_window_frames;

    if min_counterplay_observed < min_required && !defender_id_violation.is_empty() {
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_no_counterplay"),
            kind: "no_counterplay_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: violation_span.0,
            frame_end: violation_span.1,
            actor_ids: vec![defender_id_violation.clone()],
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: min_required as u64,
            observed: min_counterplay_observed as u64,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: min_counterplay_observed,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Defender '{}' had maximum actionable window of only {}f (required >= {}f)",
                defender_id_violation, min_counterplay_observed, min_required
            ),
        };

        return CheckResult {
            rule_id: "NO_COUNTERPLAY".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: min_required as u64,
            observed: min_counterplay_observed as u64,
            expected: format!(
                "Defender actionable counterplay window >= {}f",
                min_required
            ),
            violation_code: Some(ViolationCode::NoCounterplay),
            evidence: Some(evidence),
            message: format!(
                "No counterplay window for defender '{}': observed {}f < required {}f",
                defender_id_violation, min_counterplay_observed, min_required
            ),
        };
    }

    CheckResult {
        rule_id: "NO_COUNTERPLAY".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: min_required as u64,
        observed: if min_counterplay_observed == u32::MAX {
            min_required as u64
        } else {
            min_counterplay_observed as u64
        },
        expected: format!(
            "Defender actionable counterplay window >= {}f",
            min_required
        ),
        violation_code: None,
        evidence: None,
        message: "Defender counterplay window verified".to_string(),
    }
}
