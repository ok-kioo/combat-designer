//! Rule G01: Simulation Integrity & Deterministic State Verification.
//!
//! Validates that the simulation output contains structurally valid state hashes,
//! event log sequence integrity, and valid completion status.

use crate::simulation::engine::{SimulationOutput, SimulationStatus};

use crate::verification::budget::VerificationBudgetTracker;
use crate::verification::evidence::Evidence;
use crate::verification::report::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

pub fn check_simulation_integrity(
    scenario_id: &str,
    simulation: &SimulationOutput,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    match &simulation.status {
        SimulationStatus::BudgetExceeded { reason } => CheckResult {
            rule_id: "G01_SIMULATION_INTEGRITY".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::BudgetExceeded,
            threshold: 0,
            observed: 0,
            expected: "Simulation completed within budget".to_string(),
            violation_code: Some(ViolationCode::ExecutionBudget),
            evidence: None,
            message: format!("Simulation budget exceeded: {reason}"),
        },
        SimulationStatus::Error { message } => CheckResult {
            rule_id: "G01_SIMULATION_INTEGRITY".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Error,
            threshold: 0,
            observed: 0,
            expected: "Simulation completed without error".to_string(),
            violation_code: Some(ViolationCode::InvalidSimulation),
            evidence: None,
            message: format!("Simulation error: {message}"),
        },
        SimulationStatus::Completed => {
            // Validate hash length (SHA-256 is 64 hex characters)
            if simulation.final_state_hash.len() != 64 {
                return CheckResult {
                    rule_id: "G01_SIMULATION_INTEGRITY".to_string(),
                    scenario_id: scenario_id.to_string(),
                    status: CheckStatus::Fail,
                    threshold: 64,
                    observed: simulation.final_state_hash.len() as u64,
                    expected: "Valid 64-char hex SHA-256 state hash".to_string(),
                    violation_code: Some(ViolationCode::InvalidSimulation),
                    evidence: None,
                    message: "Simulation produced invalid or empty StateHash".to_string(),
                };
            }

            // Verify event sequence monotonicity
            let mut last_seq = 0u64;
            for event in &simulation.events {
                let _ = tracker.track_step();
                if event.sequence < last_seq {
                    return CheckResult {
                        rule_id: "G01_SIMULATION_INTEGRITY".to_string(),
                        scenario_id: scenario_id.to_string(),
                        status: CheckStatus::Fail,
                        threshold: last_seq,
                        observed: event.sequence,
                        expected: "Monotonically increasing event sequence numbers".to_string(),
                        violation_code: Some(ViolationCode::InvalidSimulation),
                        evidence: None,
                        message: "Event log sequence non-monotonic or corrupted".to_string(),
                    };
                }
                last_seq = event.sequence;
            }

            let evidence = Evidence {
                evidence_id: format!("{scenario_id}_g01_evidence"),
                kind: "simulation_integrity".to_string(),
                severity: "info".to_string(),
                frame_start: 0,
                frame_end: simulation.total_frames,
                actor_ids: Vec::new(),
                attack_ids: Vec::new(),
                event_ids: Vec::new(),
                state_fingerprints: Vec::new(),
                simulation_state_hash: simulation.final_state_hash.clone(),
                threshold: 64,
                observed: 64,
                cycle_states: Vec::new(),
                stamina_cost_net: 0,
                observed_reaction_window_frames: 0,
                observed_dps: 0,
                observed_burst: 0,
                observed_juggle_frames: 0,
                guard_break_escape_options: 0,
                missing_provenance_fields: Vec::new(),
                details: format!(
                    "Verified {} events across {} frames with StateHash {}",
                    simulation.events.len(),
                    simulation.total_frames,
                    simulation.final_state_hash
                ),
            };

            CheckResult {
                rule_id: "G01_SIMULATION_INTEGRITY".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Pass,
                threshold: 64,
                observed: 64,
                expected: "Valid 64-character SHA-256 hash and monotonic event log".to_string(),
                violation_code: None,
                evidence: Some(evidence),
                message: "Simulation integrity confirmed".to_string(),
            }
        }
    }
}
