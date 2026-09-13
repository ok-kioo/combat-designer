//! Rule G02: Infinite Stun Loop & Cycle Verification.
//!
//! Verifies that any reachable combat cycle possesses at least one escape opportunity,
//! net resource depletion, finite counter, or terminal transition.

use crate::simulation::engine::SimulationOutput;

use crate::verification::budget::{BudgetExceededReason, VerificationBudgetTracker};
use crate::verification::cycle_detector::CycleDetector;
use crate::verification::evidence::Evidence;
use crate::verification::profile::VerificationProfile;
use crate::verification::report::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

pub fn check_infinite_loop(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    if !profile.require_cycle_analysis {
        return CheckResult {
            rule_id: "G02_INFINITE_LOOP".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: 0,
            observed: 0,
            expected: "Cycle analysis skipped in current profile".to_string(),
            violation_code: None,
            evidence: None,
            message: "Cycle analysis disabled in current profile".to_string(),
        };
    }

    let cycles = match CycleDetector::detect_cycles(&simulation.snapshots, tracker) {
        Ok(c) => c,
        Err(BudgetExceededReason::CyclesExceeded { current, limit }) => {
            return CheckResult {
                rule_id: "G02_INFINITE_LOOP".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::BudgetExceeded,
                threshold: limit as u64,
                observed: current as u64,
                expected: "Cycle exploration completed within budget".to_string(),
                violation_code: Some(ViolationCode::ExecutionBudget),
                evidence: None,
                message: format!("Cycle exploration budget exceeded: {current} >= {limit}"),
            };
        }
        Err(reason) => {
            return CheckResult {
                rule_id: "G02_INFINITE_LOOP".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::BudgetExceeded,
                threshold: 0,
                observed: 0,
                expected: "Cycle exploration within budget".to_string(),
                violation_code: Some(ViolationCode::ExecutionBudget),
                evidence: None,
                message: format!("Verification budget exceeded: {reason}"),
            };
        }
    };

    if let Some(unbounded_cycle) = cycles.into_iter().find(|c| c.is_unbounded) {
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g02_cycle_violation"),
            kind: "infinite_loop_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: unbounded_cycle.start_frame,
            frame_end: unbounded_cycle.end_frame,
            actor_ids: vec![unbounded_cycle.actor_id.clone()],
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: unbounded_cycle.cycle_states.clone(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: 0,
            observed: unbounded_cycle.cycle_length_frames as u64,
            cycle_states: unbounded_cycle.cycle_states.clone(),
            stamina_cost_net: unbounded_cycle.stamina_cost_net,
            observed_reaction_window_frames: unbounded_cycle.min_reaction_window_frames,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Unbounded loop detected on actor '{}': {} frames, net stamina cost {}, reaction window {}f",
                unbounded_cycle.actor_id,
                unbounded_cycle.cycle_length_frames,
                unbounded_cycle.stamina_cost_net,
                unbounded_cycle.min_reaction_window_frames
            ),
        };

        return CheckResult {
            rule_id: "G02_INFINITE_LOOP".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: 0,
            observed: unbounded_cycle.cycle_length_frames as u64,
            expected: "No unbounded loops without escape or cost".to_string(),
            violation_code: Some(ViolationCode::InfiniteStunLoop),
            evidence: Some(evidence),
            message: format!(
                "Infinite loop detected: actor '{}' trapped in {}-frame cycle without escape or stamina cost",
                unbounded_cycle.actor_id, unbounded_cycle.cycle_length_frames
            ),
        };
    }

    CheckResult {
        rule_id: "G02_INFINITE_LOOP".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 0,
        observed: 0,
        expected: "All cycles have escape or negative net cost".to_string(),
        violation_code: None,
        evidence: None,
        message: "No infinite stun loops detected".to_string(),
    }
}
