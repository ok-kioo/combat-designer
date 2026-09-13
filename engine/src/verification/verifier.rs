//! CombatVerifier diagnostic engine.
//!
//! Evaluates simulation facts against verification profiles and mechanical safety rules.
//! Produces deterministic, bounded, diagnostic AnalysisReport with audit hashes.

use crate::simulation::engine::SimulationOutput;
use crate::simulation::sha256::Sha256;
use serde::{Deserialize, Serialize};

use crate::verification::budget::{VerificationBudget, VerificationBudgetTracker};
use crate::verification::evidence::Evidence;
use crate::verification::hash::compute_analysis_hash;
use crate::verification::profile::VerificationProfile;
use crate::verification::report::{AnalysisReport, AnalysisStatus, CheckResult, CheckStatus};
use crate::verification::rules::*;
use crate::verification::stale::{FreshnessContext, StaleChecker};
use crate::verification::violations::ViolationCode;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerificationRequest {
    pub workspace_id: String,
    pub project_revision: String,
    pub canonical_snapshot_hash: String,
    pub simulation_input_hash: String,
    pub simulation_input: serde_json::Value,
    pub verification_profile: VerificationProfile,
    pub verification_budget: VerificationBudget,
    pub rule_set_version: String,
    pub verifier_version: String,
}

pub struct CombatVerifier;

impl CombatVerifier {
    /// Standard verification entrypoint.
    pub fn verify(request: &VerificationRequest, simulation: &SimulationOutput) -> AnalysisReport {
        Self::verify_internal(request, simulation, None)
    }

    /// Verification with baseline freshness context check.
    pub fn verify_with_baseline(
        request: &VerificationRequest,
        simulation: &SimulationOutput,
        baseline: &FreshnessContext,
    ) -> AnalysisReport {
        Self::verify_internal(request, simulation, Some(baseline))
    }

    fn verify_internal(
        request: &VerificationRequest,
        simulation: &SimulationOutput,
        baseline: Option<&FreshnessContext>,
    ) -> AnalysisReport {
        let mut tracker = VerificationBudgetTracker::new(request.verification_budget);
        let profile_str = match request.verification_profile.kind {
            crate::verification::profile::VerificationProfileKind::Strict => "strict",
            crate::verification::profile::VerificationProfileKind::Fast => "fast",
            crate::verification::profile::VerificationProfileKind::Research => "research",
        };

        // 1. Freshness check against baseline if provided
        if let Some(base) = baseline {
            let actual = FreshnessContext {
                workspace_id: request.workspace_id.clone(),
                project_revision: request.project_revision.clone(),
                canonical_snapshot_hash: request.canonical_snapshot_hash.clone(),
                simulation_input_hash: request.simulation_input_hash.clone(),
                verification_profile: profile_str.to_string(),
                rule_set_version: request.rule_set_version.clone(),
                verifier_version: request.verifier_version.clone(),
            };

            if let Err(stale_reason) = StaleChecker::verify_freshness(base, &actual) {
                let check = CheckResult {
                    rule_id: "STALE_PROTECTION".to_string(),
                    scenario_id: "baseline".to_string(),
                    status: CheckStatus::Fail,
                    threshold: 0,
                    observed: 1,
                    expected: "Current revision matches baseline".to_string(),
                    violation_code: Some(ViolationCode::StaleRevision),
                    evidence: None,
                    message: stale_reason.description(),
                };

                let budget_res = tracker.to_result();
                let checks = vec![check];
                let violations = vec![ViolationCode::StaleRevision];
                let evidence = Vec::new();

                let analysis_hash = compute_analysis_hash(
                    &request.workspace_id,
                    &request.project_revision,
                    &request.canonical_snapshot_hash,
                    &request.simulation_input_hash,
                    &simulation.final_state_hash,
                    "",
                    profile_str,
                    &request.rule_set_version,
                    &request.verifier_version,
                    &AnalysisStatus::Stale,
                    &checks,
                    &violations,
                    &evidence,
                    &budget_res,
                );

                return AnalysisReport {
                    analysis_run_id: format!("analysis_run_{}", &analysis_hash[..16]),
                    workspace_id: request.workspace_id.clone(),
                    project_revision: request.project_revision.clone(),
                    canonical_snapshot_hash: request.canonical_snapshot_hash.clone(),
                    simulation_input_hash: request.simulation_input_hash.clone(),
                    simulation_state_hash: simulation.final_state_hash.clone(),
                    event_log_hash: String::new(),
                    verification_profile: profile_str.to_string(),
                    rule_set_version: request.rule_set_version.clone(),
                    analyzer_version: request.verifier_version.clone(),
                    status: AnalysisStatus::Stale,
                    checks,
                    violations,
                    evidence,
                    budgets: budget_res,
                    analysis_hash,
                };
            }
        }

        // 2. Validate request boundaries (fail-closed if critical workspace or revision is missing)
        if request.workspace_id.trim().is_empty() {
            let check = CheckResult {
                rule_id: "REQUEST_VALIDATION".to_string(),
                scenario_id: "request".to_string(),
                status: CheckStatus::Error,
                threshold: 0,
                observed: 0,
                expected: "Non-empty workspace_id".to_string(),
                violation_code: Some(ViolationCode::InvalidSimulation),
                evidence: None,
                message: "workspace_id is strictly required for verification".to_string(),
            };
            let budget_res = tracker.to_result();
            let checks = vec![check];
            let violations = vec![ViolationCode::InvalidSimulation];
            let evidence = Vec::new();

            let analysis_hash = compute_analysis_hash(
                &request.workspace_id,
                &request.project_revision,
                &request.canonical_snapshot_hash,
                &request.simulation_input_hash,
                &simulation.final_state_hash,
                "",
                profile_str,
                &request.rule_set_version,
                &request.verifier_version,
                &AnalysisStatus::Error,
                &checks,
                &violations,
                &evidence,
                &budget_res,
            );

            return AnalysisReport {
                analysis_run_id: format!("analysis_run_{}", &analysis_hash[..16]),
                workspace_id: request.workspace_id.clone(),
                project_revision: request.project_revision.clone(),
                canonical_snapshot_hash: request.canonical_snapshot_hash.clone(),
                simulation_input_hash: request.simulation_input_hash.clone(),
                simulation_state_hash: simulation.final_state_hash.clone(),
                event_log_hash: String::new(),
                verification_profile: profile_str.to_string(),
                rule_set_version: request.rule_set_version.clone(),
                analyzer_version: request.verifier_version.clone(),
                status: AnalysisStatus::Error,
                checks,
                violations,
                evidence,
                budgets: budget_res,
                analysis_hash,
            };
        }

        let scenario_id = request
            .simulation_input
            .get("scenario")
            .and_then(|s| s.get("scenario_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("scenario_default");

        // 3. Track events in verification budget
        let event_count = simulation.events.len() as u32;
        if let Err(reason) = tracker.track_events(event_count) {
            let budget_res = tracker.to_result();
            let check = CheckResult {
                rule_id: "VERIFICATION_BUDGET".to_string(),
                scenario_id: scenario_id.to_string(),
                status: CheckStatus::BudgetExceeded,
                threshold: request.verification_budget.max_events_to_analyze as u64,
                observed: event_count as u64,
                expected: "Events within allocated verification budget".to_string(),
                violation_code: Some(ViolationCode::ExecutionBudget),
                evidence: None,
                message: format!("Verification budget exceeded: {reason}"),
            };
            let checks = vec![check];
            let violations = vec![ViolationCode::ExecutionBudget];
            let evidence = Vec::new();

            let analysis_hash = compute_analysis_hash(
                &request.workspace_id,
                &request.project_revision,
                &request.canonical_snapshot_hash,
                &request.simulation_input_hash,
                &simulation.final_state_hash,
                "",
                profile_str,
                &request.rule_set_version,
                &request.verifier_version,
                &AnalysisStatus::BudgetExceeded,
                &checks,
                &violations,
                &evidence,
                &budget_res,
            );

            return AnalysisReport {
                analysis_run_id: format!("analysis_run_{}", &analysis_hash[..16]),
                workspace_id: request.workspace_id.clone(),
                project_revision: request.project_revision.clone(),
                canonical_snapshot_hash: request.canonical_snapshot_hash.clone(),
                simulation_input_hash: request.simulation_input_hash.clone(),
                simulation_state_hash: simulation.final_state_hash.clone(),
                event_log_hash: String::new(),
                verification_profile: profile_str.to_string(),
                rule_set_version: request.rule_set_version.clone(),
                analyzer_version: request.verifier_version.clone(),
                status: AnalysisStatus::BudgetExceeded,
                checks,
                violations,
                evidence,
                budgets: budget_res,
                analysis_hash,
            };
        }

        // 4. Execute rules deterministically
        let mut checks = Vec::new();

        // G01: Simulation Integrity
        let g01 = check_simulation_integrity(scenario_id, simulation, &mut tracker);
        checks.push(g01);

        // G02: Infinite Stun Loop
        let g02 = check_infinite_loop(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g02);

        // G03: Stun Lock
        let g03 = check_stun_lock(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g03);

        // G04: Resource Safety
        let g04 = check_resource_safety(scenario_id, simulation, &mut tracker);
        checks.push(g04);

        // G05 & G06: DPS and Burst
        let (g05, g06) = check_dps_and_burst(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g05);
        checks.push(g06);

        // G07: Juggle Duration
        let g07 = check_juggle(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g07);

        // G08: Cancel Validity
        let g08 = check_cancel_validity(scenario_id, simulation, &mut tracker);
        checks.push(g08);

        // G09: Provenance
        let g09 = check_provenance(
            scenario_id,
            &request.project_revision,
            &request.simulation_input,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g09);

        // G10: Zero-Risk Attack
        let g10 = check_zero_risk(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g10);

        // G11: Guard Integrity
        let g11 = check_guard_integrity(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(g11);

        // Counterplay
        let counterplay = check_counterplay(
            scenario_id,
            simulation,
            &request.verification_profile,
            &mut tracker,
        );
        checks.push(counterplay);

        // 5. Aggregate checks and determine AnalysisStatus (Fail-Closed)
        let mut violations = Vec::new();
        let mut evidence = Vec::new();
        let mut has_fail = false;
        let mut has_blocked = false;
        let mut has_inconclusive = false;
        let mut has_budget_exceeded = false;
        let mut has_error = false;

        for check in &checks {
            if let Some(ref v) = check.violation_code {
                if !violations.contains(v) {
                    violations.push(*v);
                }
            }
            if let Some(ref ev) = check.evidence {
                let _ = tracker.track_evidence();
                evidence.push(ev.clone());
            }

            match check.status {
                CheckStatus::Fail => has_fail = true,
                CheckStatus::Blocked => has_blocked = true,
                CheckStatus::Inconclusive => has_inconclusive = true,
                CheckStatus::BudgetExceeded => has_budget_exceeded = true,
                CheckStatus::Error => has_error = true,
                CheckStatus::Pass => {}
            }
        }

        let budget_res = tracker.to_result();
        if budget_res.exhausted {
            has_budget_exceeded = true;
            if !violations.contains(&ViolationCode::ExecutionBudget) {
                violations.push(ViolationCode::ExecutionBudget);
            }
        }

        let status = if has_error {
            AnalysisStatus::Error
        } else if has_budget_exceeded {
            AnalysisStatus::BudgetExceeded
        } else if has_fail {
            AnalysisStatus::FindingsDetected
        } else if has_blocked || (has_inconclusive && request.verification_profile.is_fail_closed())
        {
            AnalysisStatus::Blocked
        } else {
            AnalysisStatus::Clear
        };

        // 6. Sort evidence deterministically
        Evidence::sort_slice(&mut evidence);

        // 7. Calculate event log hash
        let events_serialized = serde_json::to_vec(&simulation.events).unwrap_or_default();
        let event_log_hash = Sha256::digest(&events_serialized);

        // 8. Compute canonical AnalysisReport hash
        let analysis_hash = compute_analysis_hash(
            &request.workspace_id,
            &request.project_revision,
            &request.canonical_snapshot_hash,
            &request.simulation_input_hash,
            &simulation.final_state_hash,
            &event_log_hash,
            profile_str,
            &request.rule_set_version,
            &request.verifier_version,
            &status,
            &checks,
            &violations,
            &evidence,
            &budget_res,
        );

        let analysis_run_id = format!("analysis_run_{}", &analysis_hash[..16]);

        AnalysisReport {
            analysis_run_id,
            workspace_id: request.workspace_id.clone(),
            project_revision: request.project_revision.clone(),
            canonical_snapshot_hash: request.canonical_snapshot_hash.clone(),
            simulation_input_hash: request.simulation_input_hash.clone(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            event_log_hash,
            verification_profile: profile_str.to_string(),
            rule_set_version: request.rule_set_version.clone(),
            analyzer_version: request.verifier_version.clone(),
            status,
            checks,
            violations,
            evidence,
            budgets: budget_res,
            analysis_hash,
        }
    }
}
