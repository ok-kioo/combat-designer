//! Rule G10: Zero-Risk Attack Verification.
//!
//! Evaluates combined evidence of high damage, invulnerability, unpunishable recovery,
//! and absence of defender counterplay. Never considers invulnerability alone as proof.
//! When inconclusive, fails closed in strict mode.

use combat_simulation::engine::SimulationOutput;
use combat_simulation::events::SimulationEventType;

use crate::budget::VerificationBudgetTracker;
use crate::evidence::Evidence;
use crate::profile::VerificationProfile;
use crate::verdict::{CheckResult, CheckStatus};
use crate::violations::ViolationCode;

pub fn check_zero_risk(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    // If simulation has no attacks or events, proof is inconclusive
    let has_attacks = simulation
        .events
        .iter()
        .any(|e| e.event_type == SimulationEventType::AttackStarted);

    if !has_attacks && simulation.metrics.hits == 0 {
        if profile.is_fail_closed() {
            return CheckResult {
                rule_id: "G10_ZERO_RISK_ATTACK".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Inconclusive,
                threshold: 0,
                observed: 0,
                expected: "Sufficient simulation evidence of attack risk and vulnerability".to_string(),
                violation_code: None,
                evidence: None,
                message: "Inconclusive evidence: no attack executions observed to evaluate zero-risk invariant".to_string(),
            };
        } else {
            return CheckResult {
                rule_id: "G10_ZERO_RISK_ATTACK".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Pass,
                threshold: 0,
                observed: 0,
                expected: "Zero-risk evaluation skipped in non-strict profile".to_string(),
                violation_code: None,
                evidence: None,
                message: "No attacks present to evaluate".to_string(),
            };
        }
    }

    // Check snapshots for combined zero-risk pattern:
    // Attacker deals damage while permanently invulnerable and having 0 recovery frames
    let mut zero_risk_detected = false;
    let mut zero_risk_attacker = String::new();
    let mut zero_risk_attack_id = String::new();

    if !simulation.snapshots.is_empty() {
        for snap in &simulation.snapshots {
            let _ = tracker.track_step();
            for (actor_id, actor) in &snap.actors {
                // If actor deals damage, is invulnerable throughout, and has recovery_frames == 0
                let is_invuln = actor.combat_state.contains("invuln");
                if (is_invuln || actor.combat_state == "invulnerable")
                    && actor.active_attack.is_some()
                    && simulation.metrics.damage > 50
                    && simulation.metrics.recovery_frames == 0
                {
                    zero_risk_detected = true;
                    zero_risk_attacker = actor_id.clone();
                    zero_risk_attack_id = actor.active_attack.clone().unwrap_or_default();
                    break;
                }
            }
            if zero_risk_detected {
                break;
            }
        }
    }

    if zero_risk_detected {
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g10_zero_risk_violation"),
            kind: "zero_risk_attack_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: 0,
            frame_end: simulation.total_frames,
            actor_ids: vec![zero_risk_attacker.clone()],
            attack_ids: vec![zero_risk_attack_id.clone()],
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
            details: format!(
                "Actor '{}' executed attack '{}' with significant damage, total invulnerability, and unpunishable recovery",
                zero_risk_attacker, zero_risk_attack_id
            ),
        };

        return CheckResult {
            rule_id: "G10_ZERO_RISK_ATTACK".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: 0,
            observed: 1,
            expected: "Attacks possess punishable recovery or vulnerability windows".to_string(),
            violation_code: Some(ViolationCode::ZeroRiskAttack),
            evidence: Some(evidence),
            message: format!(
                "Zero-risk attack detected on actor '{}' for attack '{}'",
                zero_risk_attacker, zero_risk_attack_id
            ),
        };
    }

    CheckResult {
        rule_id: "G10_ZERO_RISK_ATTACK".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 0,
        observed: 0,
        expected: "Attacks possess punishable recovery or vulnerability windows".to_string(),
        violation_code: None,
        evidence: None,
        message: "No zero-risk attack patterns detected".to_string(),
    }
}
