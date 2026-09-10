//! Rule G04: Resource Safety & Infinite Sustainability Verification.
//!
//! Verifies that combos and aggressive sequences respect resource budgets and do
//! not sustain indefinitely without negative net resource consumption.

use crate::simulation::engine::SimulationOutput;
use crate::simulation::events::SimulationEventType;
use std::collections::BTreeMap;

use crate::verification::budget::VerificationBudgetTracker;
use crate::verification::evidence::Evidence;
use crate::verification::verdict::{CheckResult, CheckStatus};
use crate::verification::violations::ViolationCode;

pub fn check_resource_safety(
    scenario_id: &str,
    simulation: &SimulationOutput,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    // Map actor_id -> (resource_spent_count, attack_count)
    let mut actor_resource_events: BTreeMap<String, u64> = BTreeMap::new();
    let mut actor_attacks: BTreeMap<String, u64> = BTreeMap::new();

    for event in &simulation.events {
        let _ = tracker.track_step();

        match &event.event_type {
            SimulationEventType::ResourceSpent => {
                let entry = actor_resource_events
                    .entry(event.actor_id.clone())
                    .or_insert(0);
                *entry = entry.saturating_add(1);
            }
            SimulationEventType::AttackStarted => {
                let entry = actor_attacks.entry(event.actor_id.clone()).or_insert(0);
                *entry = entry.saturating_add(1);
            }
            _ => {}
        }
    }

    // If an actor executed multiple attacks (>= 5) with 0 resource spent events and 0 metrics resource spent
    for (actor_id, attack_count) in &actor_attacks {
        let spent_events = actor_resource_events.get(actor_id).copied().unwrap_or(0);
        if *attack_count >= 5 && spent_events == 0 && simulation.metrics.resource_spent == 0 {
            let evidence = Evidence {
                evidence_id: format!("{scenario_id}_g04_resource_loop"),
                kind: "resource_loop_violation".to_string(),
                severity: "critical".to_string(),
                frame_start: 0,
                frame_end: simulation.total_frames,
                actor_ids: vec![actor_id.clone()],
                attack_ids: Vec::new(),
                event_ids: Vec::new(),
                state_fingerprints: Vec::new(),
                simulation_state_hash: simulation.final_state_hash.clone(),
                threshold: 1,
                observed: 0,
                cycle_states: Vec::new(),
                stamina_cost_net: 0,
                observed_reaction_window_frames: 0,
                observed_dps: 0,
                observed_burst: 0,
                observed_juggle_frames: 0,
                guard_break_escape_options: 0,
                missing_provenance_fields: Vec::new(),
                details: format!(
                    "Actor '{}' executed {} attacks with 0 net resource consumption or expenditure",
                    actor_id, attack_count
                ),
            };

            return CheckResult {
                rule_id: "G04_RESOURCE_SAFETY".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::Fail,
                threshold: 1,
                observed: 0,
                expected: "Non-zero resource cost for repeated attack chains".to_string(),
                violation_code: Some(ViolationCode::ResourceSafety),
                evidence: Some(evidence),
                message: format!(
                    "Resource safety violation: actor '{}' executed {} attacks without resource cost",
                    actor_id, attack_count
                ),
            };
        }
    }

    CheckResult {
        rule_id: "G04_RESOURCE_SAFETY".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 0,
        observed: 0,
        expected: "All attack sequences obey resource costs".to_string(),
        violation_code: None,
        evidence: None,
        message: "Resource safety verified".to_string(),
    }
}
