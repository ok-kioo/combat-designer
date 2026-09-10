//! Deterministic snapshot generation and canonical StateHash (SHA-256).

use crate::simulation::model::ActorState;
use crate::simulation::sha256::Sha256;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActorSnapshot {
    pub actor_id: String,
    pub health: i32,
    pub guard: i32,
    pub resources: BTreeMap<String, u32>,
    pub combat_state: String,
    pub active_attack: Option<String>,
    pub frame_in_attack: Option<u32>,
    pub is_blocking: bool,
    pub is_airborne: bool,
    pub stun_timer: u32,
    pub block_timer: u32,
}

impl From<&ActorState> for ActorSnapshot {
    fn from(a: &ActorState) -> Self {
        Self {
            actor_id: a.actor_id.clone(),
            health: a.health,
            guard: a.guard,
            resources: a.resources.clone(),
            combat_state: a.combat_state.id.clone(),
            active_attack: a
                .active_attack
                .as_ref()
                .map(|atk| atk.attack.id.to_string()),
            frame_in_attack: a.active_attack.as_ref().map(|atk| atk.frame_in_attack),
            is_blocking: a.is_blocking,
            is_airborne: a.is_airborne,
            stun_timer: a.stun_timer,
            block_timer: a.block_timer,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulationSnapshot {
    pub frame: u32,
    pub actors: BTreeMap<String, ActorSnapshot>,
    pub state_hash: String,
}

impl SimulationSnapshot {
    pub fn new(frame: u32, actors: &BTreeMap<String, ActorState>) -> Self {
        let mut actor_snapshots = BTreeMap::new();
        for (id, actor) in actors {
            actor_snapshots.insert(id.clone(), ActorSnapshot::from(actor));
        }

        // Canonical serialization with preserve_order / sorted BTreeMap keys
        let canonical_bytes = serde_json::to_vec(&actor_snapshots).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(&frame.to_le_bytes());
        hasher.update(&canonical_bytes);
        let hash_bytes = hasher.finalize();
        let mut state_hash = String::with_capacity(64);
        for b in hash_bytes {
            use std::fmt::Write;
            let _ = write!(state_hash, "{:02x}", b);
        }

        Self {
            frame,
            actors: actor_snapshots,
            state_hash,
        }
    }
}
