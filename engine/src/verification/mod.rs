//! # combat-verification
//!
//! Pure, deterministic mechanical verification and gate decision engine for Combat Designer.
//!
//! Evaluates facts produced by the Deterministic Simulator (`combat-simulation`)
//! and structural evidence from the Canonical Domain (`combat-domain`).
//!
//! Key invariants:
//! - Pure discrete integer arithmetic only (zero floats, zero wall clock)
//! - Bounded execution protected by `VerificationBudgetTracker`
//! - Fail-closed enforcement in strict profile
//! - Stale revision protection
//! - Canonical SHA-256 GateResult hash determinism

pub mod budget;
pub mod cycle_detector;
pub mod evidence;
pub mod hash;
pub mod profile;
pub mod rules;
pub mod stale;
pub mod verdict;
pub mod verifier;
pub mod violations;

pub use budget::{
    BudgetExceededReason, VerificationBudget, VerificationBudgetResult, VerificationBudgetTracker,
};
pub use cycle_detector::{ActorStateFingerprint, CycleDetector, DetectedCycle};
pub use evidence::Evidence;
pub use hash::compute_gate_result_hash;
pub use profile::{VerificationProfile, VerificationProfileKind};
pub use stale::{FreshnessContext, StaleChecker, StaleReason};
pub use verdict::{CheckResult, CheckStatus, GateResult, GateVerdict};
pub use verifier::{MechanicalVerifier, VerificationRequest};
pub use violations::ViolationCode;
