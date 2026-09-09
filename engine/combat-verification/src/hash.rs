//! Canonical deterministic SHA-256 hashing for GateResult.
//!
//! Excludes non-deterministic operational fields (like gate_run_id or wall-clock timestamps)
//! and the hash itself, ensuring identical verification runs produce identical hashes.

use combat_simulation::sha256::Sha256;
use serde::Serialize;

use crate::budget::VerificationBudgetResult;
use crate::evidence::Evidence;
use crate::verdict::{CheckResult, GateVerdict};
use crate::violations::ViolationCode;

#[derive(Serialize)]
struct CanonicalGateResultForm<'a> {
    workspace_id: &'a str,
    project_revision: &'a str,
    canonical_snapshot_hash: &'a str,
    simulation_input_hash: &'a str,
    simulation_state_hash: &'a str,
    event_log_hash: &'a str,
    verification_profile: &'a str,
    rule_set_version: &'a str,
    verifier_version: &'a str,
    verdict: &'a GateVerdict,
    checks: &'a [CheckResult],
    violations: &'a [ViolationCode],
    evidence: &'a [Evidence],
    budgets: &'a VerificationBudgetResult,
}

#[allow(clippy::too_many_arguments)]
pub fn compute_gate_result_hash(
    workspace_id: &str,
    project_revision: &str,
    canonical_snapshot_hash: &str,
    simulation_input_hash: &str,
    simulation_state_hash: &str,
    event_log_hash: &str,
    verification_profile: &str,
    rule_set_version: &str,
    verifier_version: &str,
    verdict: &GateVerdict,
    checks: &[CheckResult],
    violations: &[ViolationCode],
    evidence: &[Evidence],
    budgets: &VerificationBudgetResult,
) -> String {
    let canonical = CanonicalGateResultForm {
        workspace_id,
        project_revision,
        canonical_snapshot_hash,
        simulation_input_hash,
        simulation_state_hash,
        event_log_hash,
        verification_profile,
        rule_set_version,
        verifier_version,
        verdict,
        checks,
        violations,
        evidence,
        budgets,
    };

    let serialized = serde_json::to_vec(&canonical).expect("canonical serialization must not fail");
    Sha256::digest(&serialized)
}
