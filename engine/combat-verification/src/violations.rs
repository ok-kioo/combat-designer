//! Canonical, stable violation codes for Mechanical Gate verification.
//!
//! Codes are machine-readable identifiers consumed by Application, MCP,
//! dashboard, CI, audit logs, and LLM explanation layer.

use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ViolationCode {
    /// Infinite stun/attack cycle without escape opportunity or net cost.
    InfiniteStunLoop,
    /// Defender lacks minimal reaction/recovery window before subsequent hit.
    StunLock,
    /// Sustained DPS within sliding window exceeds profile limit.
    MaxSustainedDps,
    /// Total sequence burst damage exceeds profile limit.
    MaxBurst,
    /// Continuous airborne/juggle frames exceed profile limit.
    MaxJuggle,
    /// Sequence allows indefinite resource sustain without negative net cost.
    ResourceSafety,
    /// Attack cancel occurred outside valid window or failed cancel conditions.
    CancelValidity,
    /// Critical mechanical parameter lacks verifiable provenance in strict profile.
    ProvenanceRequired,
    /// Attack with guard_break_value > 0 lacks defender counterplay/escape options.
    GuardIntegrity,
    /// Defender has no actionable counterplay frames in recovery window.
    NoCounterplay,
    /// Attack deals significant damage with total invulnerability and unpunishable recovery.
    ZeroRiskAttack,
    /// Verification analysis exceeded allocated computational budget.
    ExecutionBudget,
    /// Gate result is invalidated by model_revision, rule_set, or snapshot advance.
    StaleRevision,
    /// Simulation output is structurally malformed, forged, or missing hashes.
    InvalidSimulation,
}

impl ViolationCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InfiniteStunLoop => "INFINITE_STUN_LOOP",
            Self::StunLock => "STUN_LOCK",
            Self::MaxSustainedDps => "MAX_SUSTAINED_DPS",
            Self::MaxBurst => "MAX_BURST",
            Self::MaxJuggle => "MAX_JUGGLE",
            Self::ResourceSafety => "RESOURCE_SAFETY",
            Self::CancelValidity => "CANCEL_VALIDITY",
            Self::ProvenanceRequired => "PROVENANCE_REQUIRED",
            Self::GuardIntegrity => "GUARD_INTEGRITY",
            Self::NoCounterplay => "NO_COUNTERPLAY",
            Self::ZeroRiskAttack => "ZERO_RISK_ATTACK",
            Self::ExecutionBudget => "EXECUTION_BUDGET",
            Self::StaleRevision => "STALE_REVISION",
            Self::InvalidSimulation => "INVALID_SIMULATION",
        }
    }

    pub fn is_safety_critical(&self) -> bool {
        matches!(
            self,
            Self::InfiniteStunLoop
                | Self::StunLock
                | Self::MaxSustainedDps
                | Self::MaxBurst
                | Self::ZeroRiskAttack
                | Self::NoCounterplay
                | Self::ProvenanceRequired
                | Self::InvalidSimulation
        )
    }
}

impl fmt::Display for ViolationCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
