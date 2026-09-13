//! Analysis reports, check statuses, and diagnostic models.

use serde::{Deserialize, Serialize};

use crate::verification::budget::VerificationBudgetResult;
use crate::verification::evidence::Evidence;
use crate::verification::violations::ViolationCode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CheckStatus {
    Pass,
    Fail,
    Blocked,
    Inconclusive,
    BudgetExceeded,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnalysisStatus {
    Clear,
    FindingsDetected,
    Blocked,
    Stale,
    BudgetExceeded,
    Error,
}

impl AnalysisStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Clear => "CLEAR",
            Self::FindingsDetected => "FINDINGS_DETECTED",
            Self::Blocked => "BLOCKED",
            Self::Stale => "STALE",
            Self::BudgetExceeded => "BUDGET_EXCEEDED",
            Self::Error => "ERROR",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckResult {
    pub rule_id: String,
    pub scenario_id: String,
    pub status: CheckStatus,
    pub threshold: u64,
    pub observed: u64,
    pub expected: String,
    pub violation_code: Option<ViolationCode>,
    pub evidence: Option<Evidence>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalysisReport {
    pub analysis_run_id: String,
    pub workspace_id: String,
    pub project_revision: String,
    pub canonical_snapshot_hash: String,
    pub simulation_input_hash: String,
    pub simulation_state_hash: String,
    pub event_log_hash: String,
    pub verification_profile: String,
    pub rule_set_version: String,
    pub analyzer_version: String,
    pub status: AnalysisStatus,
    pub checks: Vec<CheckResult>,
    pub violations: Vec<ViolationCode>,
    pub evidence: Vec<Evidence>,
    pub budgets: VerificationBudgetResult,
    pub analysis_hash: String,
}
