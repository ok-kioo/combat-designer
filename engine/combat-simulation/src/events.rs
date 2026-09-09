//! Strongly typed simulation events and deterministic ordering.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum SimulationEventType {
    AttackStarted,
    HitboxActivated,
    HitDetected,
    HitConfirmed,
    BlockConfirmed,
    GuardBroken,
    HitstunApplied,
    BlockstunApplied,
    CancelOpened,
    CancelExecuted,
    ResourceSpent,
    StateChanged,
    AttackRecovered,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulationEvent {
    pub frame: u32,
    pub actor_id: String,
    pub event_type: SimulationEventType,
    pub sequence: u64,
    pub attack_id: Option<String>,
    pub target_id: Option<String>,
    pub damage: Option<u32>,
    pub stun_frames: Option<u32>,
    pub details: Option<String>,
}

impl SimulationEvent {
    pub fn new(
        frame: u32,
        actor_id: impl Into<String>,
        event_type: SimulationEventType,
        sequence: u64,
    ) -> Self {
        Self {
            frame,
            actor_id: actor_id.into(),
            event_type,
            sequence,
            attack_id: None,
            target_id: None,
            damage: None,
            stun_frames: None,
            details: None,
        }
    }
}

/// Deterministic comparator for simulation events.
/// Enforces contract: (frame, actor_id, attack_id, sequence).
impl Ord for SimulationEvent {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.frame
            .cmp(&other.frame)
            .then_with(|| self.actor_id.cmp(&other.actor_id))
            .then_with(|| self.attack_id.cmp(&other.attack_id))
            .then_with(|| self.sequence.cmp(&other.sequence))
    }
}

impl PartialOrd for SimulationEvent {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
