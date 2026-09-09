//! Rule G09: Provenance Required Verification.
//!
//! Verifies that critical mechanical parameters and source assets possess verifiable
//! provenance in strict profile. Inconclusive or missing provenance fails closed.

use serde_json::Value;

use crate::budget::VerificationBudgetTracker;
use crate::evidence::Evidence;
use crate::profile::VerificationProfile;
use crate::verdict::{CheckResult, CheckStatus};
use crate::violations::ViolationCode;

pub fn check_provenance(
    scenario_id: &str,
    project_revision: &str,
    simulation_input: &Value,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> CheckResult {
    let _ = tracker.track_step();

    if !profile.require_provenance {
        return CheckResult {
            rule_id: "G09_PROVENANCE_REQUIRED".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: 0,
            observed: 0,
            expected: "Provenance check disabled in current profile".to_string(),
            violation_code: None,
            evidence: None,
            message: "Provenance verification skipped in non-strict profile".to_string(),
        };
    }

    let mut missing_fields: Vec<String> = Vec::new();

    if project_revision.trim().is_empty() {
        missing_fields.push("project_revision".to_string());
    }

    // Check simulation_input metadata if present
    if let Some(meta) = simulation_input.get("metadata") {
        if meta
            .get("engine")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        {
            missing_fields.push("metadata.engine".to_string());
        }
        if meta
            .get("source_path")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        {
            missing_fields.push("metadata.source_path".to_string());
        }
        if meta
            .get("parser_version")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        {
            missing_fields.push("metadata.parser_version".to_string());
        }
    } else if let Some(scenario) = simulation_input.get("scenario") {
        // If simulation_input has scenario but lacks explicit provenance metadata
        if scenario.get("provenance").is_none() && simulation_input.get("provenance").is_none() {
            missing_fields.push("provenance".to_string());
        }
    } else if simulation_input.get("provenance").is_none() {
        missing_fields.push("provenance".to_string());
    }

    if !missing_fields.is_empty() {
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g09_provenance_missing"),
            kind: "provenance_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: 0,
            frame_end: 0,
            actor_ids: Vec::new(),
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: String::new(),
            threshold: 0,
            observed: missing_fields.len() as u64,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: 0,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: missing_fields.clone(),
            details: format!(
                "Required provenance fields missing in strict profile: {}",
                missing_fields.join(", ")
            ),
        };

        return CheckResult {
            rule_id: "G09_PROVENANCE_REQUIRED".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: 0,
            observed: missing_fields.len() as u64,
            expected: "All critical parameters possess verifiable provenance".to_string(),
            violation_code: Some(ViolationCode::ProvenanceRequired),
            evidence: Some(evidence),
            message: format!(
                "Provenance missing for critical parameters: {}",
                missing_fields.join(", ")
            ),
        };
    }

    CheckResult {
        rule_id: "G09_PROVENANCE_REQUIRED".to_string(),
        scenario_id: scenario_id.to_string(),
        status: CheckStatus::Pass,
        threshold: 0,
        observed: 0,
        expected: "All critical parameters possess verifiable provenance".to_string(),
        violation_code: None,
        evidence: None,
        message: "Provenance requirements verified".to_string(),
    }
}
