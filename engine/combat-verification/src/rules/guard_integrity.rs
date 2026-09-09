//! Rule G11: Guard Integrity Verification.
//!
//! Verifies that attacks inducing guard damage allow defender escape or counterplay
//! options prior to guard breaking. In strict mode, unavoidable guard breaks fail.

use combat_simulation::engine::SimulationOutput;
use combat_simulation::events::SimulationEventType;

use crate::budget::VerificationBudgetTracker;
use crate::evidence::Evidence;
use crate::profile::VerificationProfile;
use crate::verdict::{CheckResult, CheckStatus};
use crate::violations::ViolationCode;

pub fn check_guard_integrity(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    if !profile.require_guard_integrity {
        return CheckResult {
            rule_id: "G11_GUARD_INTEGRITY".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: 0,
            observed: 0,
            expected: "Guard integrity verification disabled in profile".to_string(),
            violation_code: None,
            evidence: None,
            message: "Guard integrity check disabled in current profile".to_string(),
        };
    }

    // Look for GuardBroken events
    let guard_broken_events: Vec<&combat_simulation::events::SimulationEvent> = simulation
        .events
        .iter()
        .filter(|e| e.event_type == SimulationEventType::GuardBroken)
        .collect();

    for gb_event in guard_broken_events {
        let _ = tracker.track_step();
        let defender_id = &gb_event.actor_id;

        // Check if defender had any actionable escape frames before this guard break
        // Count frames before gb_event.frame where defender was not in blockstun or hitstun
        let mut escape_options = 0u32;
        for snap in &simulation.snapshots {
            if snap.frame < gb_event.frame {
                if let Some(defender) = snap.actors.get(defender_id) {
                    if defender.stun_timer == 0 && !defender.is_airborne {
                        escape_options = escape_options.saturating_add(1);
                    }
                }
            }
        }

        // If guard was broken with 0 escape options (unavoidable guard break lock)
        if escape_options == 0 {
            let evidence = Evidence {
                evidence_id: format!("{scenario_id}_g11_guard_integrity_violation"),
                kind: "guard_integrity_violation".to_string(),
                severity: "critical".to_string(),
                frame_start: 0,
                frame_end: gb_event.frame,
                actor_ids: vec![defender_id.clone()],
                attack_ids: vec![gb_event.attack_id.clone().unwrap_or_default()],
                event_ids: vec![gb_event.sequence],
                state_fingerprints: Vec::new(),
                simulation_state_hash: simulation.final_state_hash.clone(),
                threshold: 1,
                observed: escape_options as u64,
                cycle_states: Vec::new(),
                stamina_cost_net: 0,
                observed_reaction_window_frames: 0,
                observed_dps: 0,
                observed_burst: 0,
                observed_juggle_frames: 0,
                guard_break_escape_options: escape_options,
                missing_provenance_fields: Vec::new(),
                details: format!(
                    "Defender '{}' guard broken at frame {}f with 0 actionable escape options",
                    defender_id, gb_event.frame
                ),
            };

            return CheckResult {
                rule_id: "G11_GUARD_INTEGRITY".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Fail,
                threshold: 1,
                observed: escape_options as u64,
                expected: "Defender possesses >= 1 actionable escape option before guard break".to_string(),
                violation_code: Some(ViolationCode::GuardIntegrity),
                evidence: Some(evidence),
                message: format!(
                    "Guard integrity violation: defender '{}' suffered unavoidable guard break without escape window",
                    defender_id
                ),
            };
        }
    }

    CheckResult {
        rule_id: "G11_GUARD_INTEGRITY".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 1,
        observed: 1,
        expected: "Defender possesses >= 1 actionable escape option before guard break".to_string(),
        violation_code: None,
        evidence: None,
        message: "Guard integrity verified: escape options available before break".to_string(),
    }
}
