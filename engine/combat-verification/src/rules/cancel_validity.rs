//! Rule G08: Cancel Validity Verification.
//!
//! Verifies that attack cancels occurred strictly within valid cancel windows
//! and respected cancel eligibility conditions.

use combat_simulation::engine::SimulationOutput;
use combat_simulation::events::SimulationEventType;
use std::collections::BTreeMap;

use crate::budget::VerificationBudgetTracker;
use crate::evidence::Evidence;
use crate::verdict::{CheckResult, CheckStatus};
use crate::violations::ViolationCode;

pub fn check_cancel_validity(
    scenario_id: &str,
    simulation: &SimulationOutput,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    // Map actor_id -> currently open cancel window (attack_id, open_frame)
    let mut open_cancel_windows: BTreeMap<String, (String, u32)> = BTreeMap::new();
    let mut invalid_cancels: Vec<(String, String, u32, String)> = Vec::new();

    for event in &simulation.events {
        let _ = tracker.track_step();

        match event.event_type {
            SimulationEventType::CancelOpened => {
                let attack_id = event.attack_id.clone().unwrap_or_default();
                open_cancel_windows.insert(event.actor_id.clone(), (attack_id, event.frame));
            }
            SimulationEventType::CancelExecuted => {
                let current_attack = event.attack_id.clone().unwrap_or_default();
                if let Some((open_attack, _open_frame)) = open_cancel_windows.get(&event.actor_id) {
                    if !open_attack.is_empty()
                        && !current_attack.is_empty()
                        && open_attack != &current_attack
                    {
                        invalid_cancels.push((
                            event.actor_id.clone(),
                            current_attack.clone(),
                            event.frame,
                            format!("Cancel executed for attack '{current_attack}' while window was open for '{open_attack}'"),
                        ));
                    }
                } else {
                    // Cancel executed without an open cancel window
                    invalid_cancels.push((
                        event.actor_id.clone(),
                        current_attack,
                        event.frame,
                        "Cancel executed without open cancel window".to_string(),
                    ));
                }
            }
            SimulationEventType::AttackRecovered | SimulationEventType::StateChanged => {
                // Cancel window closes on recovery or neutral state
                open_cancel_windows.remove(&event.actor_id);
            }
            _ => {}
        }
    }

    if let Some((actor_id, attack_id, frame, reason)) = invalid_cancels.first() {
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g08_cancel_violation"),
            kind: "cancel_validity_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: *frame,
            frame_end: *frame,
            actor_ids: vec![actor_id.clone()],
            attack_ids: vec![attack_id.clone()],
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: 0,
            observed: 1,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!("Invalid cancel on actor '{actor_id}' at frame {frame}f: {reason}"),
        };

        return CheckResult {
            rule_id: "G08_CANCEL_VALIDITY".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: 0,
            observed: invalid_cancels.len() as u64,
            expected: "All cancels execute strictly within open cancel windows".to_string(),
            violation_code: Some(ViolationCode::CancelValidity),
            evidence: Some(evidence),
            message: format!("Cancel validity violation on actor '{actor_id}': {reason}"),
        };
    }

    CheckResult {
        rule_id: "G08_CANCEL_VALIDITY".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 0,
        observed: 0,
        expected: "All cancels execute strictly within open cancel windows".to_string(),
        violation_code: None,
        evidence: None,
        message: "All cancels verified within valid windows".to_string(),
    }
}
