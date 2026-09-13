//! # combat-verification
//!
//! Pure, deterministic combat analysis and diagnostic engine for Combat Designer.
//!
//! Evaluates facts produced by the Deterministic Simulator (`combat-simulation`)
//! and structural evidence from the Canonical Domain (`combat-domain`).
//!
//! Key invariants:
//! - Pure discrete integer arithmetic only (zero floats, zero wall clock)
//! - Bounded execution protected by `VerificationBudgetTracker`
//! - Fail-closed enforcement in strict profile
//! - Stale revision protection
//! - Canonical SHA-256 analysis report hash determinism

pub mod budget;
pub mod cycle_detector;
pub mod evidence;
pub mod hash;
pub mod profile;
pub mod report;
pub mod rules;
pub mod stale;
pub mod verifier;
pub mod violations;

pub use budget::{
    BudgetExceededReason, VerificationBudget, VerificationBudgetResult, VerificationBudgetTracker,
};
pub use cycle_detector::{ActorStateFingerprint, CycleDetector, DetectedCycle};
pub use evidence::Evidence;
pub use hash::compute_analysis_hash;
pub use profile::{VerificationProfile, VerificationProfileKind};
pub use report::{AnalysisReport, AnalysisStatus, CheckResult, CheckStatus};
pub use stale::{FreshnessContext, StaleChecker, StaleReason};
pub use verifier::{CombatVerifier, VerificationRequest};
pub use violations::ViolationCode;
