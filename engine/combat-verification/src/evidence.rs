//! Structured evidence model capturing verifiable facts produced by rules.
//!
//! Evidence is deterministic, strictly ordered, and contains machine-readable facts
//! instead of free-form text authority.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Evidence {
    pub evidence_id: String,
    pub kind: String,
    pub severity: String,
    pub frame_start: u32,
    pub frame_end: u32,
    pub actor_ids: Vec<String>,
    pub attack_ids: Vec<String>,
    pub event_ids: Vec<u64>,
    pub state_fingerprints: Vec<String>,
    pub simulation_state_hash: String,
    pub threshold: u64,
    pub observed: u64,
    pub cycle_states: Vec<String>,
    pub stamina_cost_net: i32,
    pub observed_reaction_window_frames: u32,
    pub observed_dps: u64,
    pub observed_burst: u64,
    pub observed_juggle_frames: u32,
    pub guard_break_escape_options: u32,
    pub missing_provenance_fields: Vec<String>,
    pub details: String,
}

impl Evidence {
    pub fn canonical_sort_key(&self) -> (u32, u32, &Vec<String>, &Vec<String>, &String) {
        (
            self.frame_start,
            self.frame_end,
            &self.actor_ids,
            &self.attack_ids,
            &self.evidence_id,
        )
    }

    pub fn sort_slice(items: &mut [Evidence]) {
        items.sort_by(|a, b| a.canonical_sort_key().cmp(&b.canonical_sort_key()));
    }
}
