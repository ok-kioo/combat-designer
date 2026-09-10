//! Stale protection evaluating validity against revisions, snapshots, and rules.
//!
//! A GateResult is valid ONLY for the exact combination of (workspace, revision,
//! snapshot_hash, input_hash, profile, rule_set_version, verifier_version).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FreshnessContext {
    pub workspace_id: String,
    pub project_revision: String,
    pub canonical_snapshot_hash: String,
    pub simulation_input_hash: String,
    pub verification_profile: String,
    pub rule_set_version: String,
    pub verifier_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StaleReason {
    WorkspaceMismatch { expected: String, actual: String },
    RevisionMismatch { expected: String, actual: String },
    SnapshotHashMismatch { expected: String, actual: String },
    SimulationInputHashMismatch { expected: String, actual: String },
    ProfileMismatch { expected: String, actual: String },
    RuleSetVersionMismatch { expected: String, actual: String },
    VerifierVersionMismatch { expected: String, actual: String },
}

impl StaleReason {
    pub fn description(&self) -> String {
        match self {
            Self::WorkspaceMismatch { expected, actual } => {
                format!("Workspace mismatch: expected '{expected}', got '{actual}'")
            }
            Self::RevisionMismatch { expected, actual } => {
                format!("Project revision mismatch: expected '{expected}', got '{actual}'")
            }
            Self::SnapshotHashMismatch { expected, actual } => {
                format!("Canonical snapshot hash mismatch: expected '{expected}', got '{actual}'")
            }
            Self::SimulationInputHashMismatch { expected, actual } => {
                format!("Simulation input hash mismatch: expected '{expected}', got '{actual}'")
            }
            Self::ProfileMismatch { expected, actual } => {
                format!("Verification profile mismatch: expected '{expected}', got '{actual}'")
            }
            Self::RuleSetVersionMismatch { expected, actual } => {
                format!("Rule set version mismatch: expected '{expected}', got '{actual}'")
            }
            Self::VerifierVersionMismatch { expected, actual } => {
                format!("Verifier version mismatch: expected '{expected}', got '{actual}'")
            }
        }
    }
}

pub struct StaleChecker;

impl StaleChecker {
    pub fn verify_freshness(
        expected: &FreshnessContext,
        actual: &FreshnessContext,
    ) -> Result<(), StaleReason> {
        if expected.workspace_id != actual.workspace_id {
            return Err(StaleReason::WorkspaceMismatch {
                expected: expected.workspace_id.clone(),
                actual: actual.workspace_id.clone(),
            });
        }
        if expected.project_revision != actual.project_revision {
            return Err(StaleReason::RevisionMismatch {
                expected: expected.project_revision.clone(),
                actual: actual.project_revision.clone(),
            });
        }
        if expected.canonical_snapshot_hash != actual.canonical_snapshot_hash {
            return Err(StaleReason::SnapshotHashMismatch {
                expected: expected.canonical_snapshot_hash.clone(),
                actual: actual.canonical_snapshot_hash.clone(),
            });
        }
        if expected.simulation_input_hash != actual.simulation_input_hash {
            return Err(StaleReason::SimulationInputHashMismatch {
                expected: expected.simulation_input_hash.clone(),
                actual: actual.simulation_input_hash.clone(),
            });
        }
        if expected.verification_profile != actual.verification_profile {
            return Err(StaleReason::ProfileMismatch {
                expected: expected.verification_profile.clone(),
                actual: actual.verification_profile.clone(),
            });
        }
        if expected.rule_set_version != actual.rule_set_version {
            return Err(StaleReason::RuleSetVersionMismatch {
                expected: expected.rule_set_version.clone(),
                actual: actual.rule_set_version.clone(),
            });
        }
        if expected.verifier_version != actual.verifier_version {
            return Err(StaleReason::VerifierVersionMismatch {
                expected: expected.verifier_version.clone(),
                actual: actual.verifier_version.clone(),
            });
        }
        Ok(())
    }
}
