//! Rule G03: Stun Lock & Minimal Defender Reaction Window Verification.
//!
//! Validates that the target receives a required minimum reaction window between
//! consecutive stun-inducing hits.

use crate::simulation::engine::SimulationOutput;
use crate::simulation::events::SimulationEventType;
use std::collections::BTreeMap;

use crate::verification::budget::VerificationBudgetTracker;
use crate::verification::evidence::Evidence;
use crate::verification::profile::VerificationProfile;
use crate::verification::verdict::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

struct PriorHitRecord {
    frame: u32,
    stun_end_frame: u32,
    attack_id: String,
}

pub fn check_stun_lock(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    // Map target_id -> last hit record
    let mut last_hit: BTreeMap<String, PriorHitRecord> = BTreeMap::new();
    let mut min_observed_reaction_window = u32::MAX;
    let mut worst_violation: Option<(String, u32, u32, String, String)> = None;

    for event in &simulation.events {
        let _ = tracker.track_step();

        if event.event_type == SimulationEventType::HitstunApplied
            || event.event_type == SimulationEventType::BlockstunApplied
        {
            let target_id = &event.actor_id;
            let current_frame = event.frame;
            let stun_duration = event.stun_frames.unwrap_or(8);
            let attack_id = event
                .attack_id
                .clone()
                .unwrap_or_else(|| "attack".to_string());
            let reaction_desc = format!("{:?}", event.event_type);

            if let Some(prior) = last_hit.get(target_id) {
                let reaction_window = current_frame.saturating_sub(prior.stun_end_frame);
                if reaction_window < min_observed_reaction_window {
                    min_observed_reaction_window = reaction_window;
                }

                if reaction_window < profile.min_reaction_window_frames {
                    worst_violation = Some((
                        target_id.clone(),
                        prior.frame,
                        current_frame,
                        prior.attack_id.clone(),
                        reaction_desc,
                    ));
                }
            }

            let stun_end = current_frame.saturating_add(stun_duration);
            last_hit.insert(
                target_id.clone(),
                PriorHitRecord {
                    frame: current_frame,
                    stun_end_frame: stun_end,
                    attack_id,
                },
            );
        }
    }

    if let Some((target_id, f_start, f_end, atk, rxn)) = worst_violation {
        let observed_window = min_observed_reaction_window;
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g03_stun_lock"),
            kind: "stun_lock_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: f_start,
            frame_end: f_end,
            actor_ids: vec![target_id.clone()],
            attack_ids: vec![atk],
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: profile.min_reaction_window_frames as u64,
            observed: observed_window as u64,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: observed_window,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Defender '{}' received {} hit with only {}f reaction window (required >= {}f)",
                target_id, rxn, observed_window, profile.min_reaction_window_frames
            ),
        };

        return CheckResult {
            rule_id: "G03_STUN_LOCK".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: profile.min_reaction_window_frames as u64,
            observed: observed_window as u64,
            expected: format!("Reaction window >= {}f", profile.min_reaction_window_frames),
            violation_code: Some(ViolationCode::StunLock),
            evidence: Some(evidence),
            message: format!(
                "Stun lock detected on actor '{}': observed reaction window of {}f < required {}f",
                target_id, observed_window, profile.min_reaction_window_frames
            ),
        };
    }

    CheckResult {
        rule_id: "G03_STUN_LOCK".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: profile.min_reaction_window_frames as u64,
        observed: if min_observed_reaction_window == u32::MAX {
            profile.min_reaction_window_frames as u64
        } else {
            min_observed_reaction_window as u64
        },
        expected: format!("Reaction window >= {}f", profile.min_reaction_window_frames),
        violation_code: None,
        evidence: None,
        message: "Target obtains required minimal reaction window".to_string(),
    }
}
