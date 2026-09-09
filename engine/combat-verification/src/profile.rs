//! Verification profiles defining rules, thresholds, and fail-closed policies.
//!
//! Profiles determine strictness, evidence requirements, and whether
//! inconclusive or missing proofs fail closed.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerificationProfileKind {
    Strict,
    Fast,
    Research,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerificationProfile {
    pub kind: VerificationProfileKind,
    pub max_sustained_dps: u64,
    pub max_burst_damage: u64,
    pub dps_window_frames: u32,
    pub max_juggle_frames: u32,
    pub min_reaction_window_frames: u32,
    pub min_counterplay_window_frames: u32,
    pub require_provenance: bool,
    pub require_guard_integrity: bool,
    pub require_cycle_analysis: bool,
}

impl VerificationProfile {
    pub fn strict() -> Self {
        Self {
            kind: VerificationProfileKind::Strict,
            max_sustained_dps: 150,
            max_burst_damage: 250,
            dps_window_frames: 60,
            max_juggle_frames: 90,
            min_reaction_window_frames: 4,
            min_counterplay_window_frames: 6,
            require_provenance: true,
            require_guard_integrity: true,
            require_cycle_analysis: true,
        }
    }

    pub fn fast() -> Self {
        Self {
            kind: VerificationProfileKind::Fast,
            max_sustained_dps: 180,
            max_burst_damage: 300,
            dps_window_frames: 60,
            max_juggle_frames: 120,
            min_reaction_window_frames: 2,
            min_counterplay_window_frames: 4,
            require_provenance: false,
            require_guard_integrity: false,
            require_cycle_analysis: true,
        }
    }

    pub fn research() -> Self {
        Self {
            kind: VerificationProfileKind::Research,
            max_sustained_dps: 300,
            max_burst_damage: 500,
            dps_window_frames: 60,
            max_juggle_frames: 180,
            min_reaction_window_frames: 1,
            min_counterplay_window_frames: 2,
            require_provenance: false,
            require_guard_integrity: false,
            require_cycle_analysis: false,
        }
    }

    pub fn is_fail_closed(&self) -> bool {
        matches!(self.kind, VerificationProfileKind::Strict)
    }

    pub fn can_authorize_release(&self) -> bool {
        !matches!(self.kind, VerificationProfileKind::Research)
    }
}

impl Default for VerificationProfile {
    fn default() -> Self {
        Self::strict()
    }
}
