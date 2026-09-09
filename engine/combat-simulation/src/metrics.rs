//! Observational metrics produced by the deterministic simulator.
//!
//! Architectural rule:
//! Metrics are strictly observational. They measure "WHAT HAPPENS?".
//! They NEVER make PASS/FAIL or safety determinations (that belongs to Spec 05 Mechanical Gate).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulationMetrics {
    pub total_frames: u32,
    pub damage: u32,
    pub hits: u32,
    pub blocked_hits: u32,
    pub misses: u32,
    pub stun_frames: u32,
    pub recovery_frames: u32,
    pub resource_spent: u32,
    pub resource_remaining: u32,
    pub state_transitions: u32,
    pub cancel_count: u32,
    pub launch_count: u32,
    pub juggle_count: u32,
}
