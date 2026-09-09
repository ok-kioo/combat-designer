//! Deterministic cycle and loop analysis over simulation state traces.
//!
//! Identifies recurring actor/attack state sequences and evaluates whether
//! cycles possess escape opportunities, net negative resource costs, finite counters,
//! or terminal transitions.

use combat_simulation::snapshot::SimulationSnapshot;
use std::collections::BTreeMap;

use crate::budget::{BudgetExceededReason, VerificationBudgetTracker};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActorStateFingerprint {
    pub actor_id: String,
    pub combat_state: String,
    pub active_attack_id: Option<String>,
    pub frame_in_attack: Option<u32>,
    pub is_airborne: bool,
    pub stun_timer: u32,
    pub is_blocking: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedCycle {
    pub actor_id: String,
    pub cycle_states: Vec<String>,
    pub start_frame: u32,
    pub end_frame: u32,
    pub cycle_length_frames: u32,
    pub stamina_cost_net: i32,
    pub min_reaction_window_frames: u32,
    pub has_escape_opportunity: bool,
    pub is_unbounded: bool,
}

pub struct CycleDetector;

impl CycleDetector {
    /// Detect cycles in actor states across simulation snapshots.
    pub fn detect_cycles(
        snapshots: &[SimulationSnapshot],
        tracker: &mut VerificationBudgetTracker,
    ) -> Result<Vec<DetectedCycle>, BudgetExceededReason> {
        let mut detected_cycles = Vec::new();
        if snapshots.len() < 2 {
            return Ok(detected_cycles);
        }

        // Collect unique actor IDs across snapshots
        let mut actor_ids = Vec::new();
        if let Some(first) = snapshots.first() {
            for id in first.actors.keys() {
                actor_ids.push(id.clone());
            }
        }

        for actor_id in &actor_ids {
            // Map fingerprint to list of frames where it was observed
            let mut history: BTreeMap<ActorStateFingerprint, Vec<usize>> = BTreeMap::new();

            for (idx, snap) in snapshots.iter().enumerate() {
                tracker.track_state()?;

                if let Some(actor) = snap.actors.get(actor_id) {
                    let fp = ActorStateFingerprint {
                        actor_id: actor_id.clone(),
                        combat_state: actor.combat_state.clone(),
                        active_attack_id: actor.active_attack.clone(),
                        frame_in_attack: actor.frame_in_attack,
                        is_airborne: actor.is_airborne,
                        stun_timer: actor.stun_timer,
                        is_blocking: actor.is_blocking,
                    };

                    if let Some(prior_indices) = history.get(&fp) {
                        for &prior_idx in prior_indices.iter().rev().take(5) {
                            tracker.track_cycle()?;
                            let length = (idx - prior_idx) as u32;

                            // Minimal cycle length to consider
                            if (2..=240).contains(&length) {
                                let cycle =
                                    Self::analyze_cycle(actor_id, prior_idx, idx, snapshots);
                                if cycle.is_unbounded {
                                    detected_cycles.push(cycle);
                                    break;
                                }
                            }
                        }
                    }

                    history.entry(fp).or_default().push(idx);
                }
            }
        }

        Ok(detected_cycles)
    }

    fn analyze_cycle(
        actor_id: &str,
        start_idx: usize,
        end_idx: usize,
        snapshots: &[SimulationSnapshot],
    ) -> DetectedCycle {
        let mut cycle_states = Vec::new();
        let mut start_stamina: Option<u32> = None;
        let mut end_stamina: Option<u32> = None;
        let mut min_reaction_window = u32::MAX;
        let mut consecutive_actionable = 0u32;
        let mut max_consecutive_actionable = 0u32;

        let start_frame = snapshots[start_idx].frame;
        let end_frame = snapshots[end_idx].frame;

        for snap in &snapshots[start_idx..=end_idx] {
            if let Some(actor) = snap.actors.get(actor_id) {
                let desc = format!(
                    "{}:{}",
                    actor.combat_state,
                    actor.active_attack.as_deref().unwrap_or("none")
                );
                if cycle_states.last() != Some(&desc) {
                    cycle_states.push(desc);
                }

                let stam = actor.resources.get("stamina").copied().unwrap_or(100);
                if start_stamina.is_none() {
                    start_stamina = Some(stam);
                }
                end_stamina = Some(stam);

                // Check defender reaction/escape window
                if actor.stun_timer == 0 && !actor.is_blocking && actor.active_attack.is_none() {
                    consecutive_actionable = consecutive_actionable.saturating_add(1);
                    if consecutive_actionable > max_consecutive_actionable {
                        max_consecutive_actionable = consecutive_actionable;
                    }
                } else {
                    if consecutive_actionable > 0 && consecutive_actionable < min_reaction_window {
                        min_reaction_window = consecutive_actionable;
                    }
                    consecutive_actionable = 0;
                }
            }
        }

        if min_reaction_window == u32::MAX {
            min_reaction_window = max_consecutive_actionable;
        }

        let start_stam = start_stamina.unwrap_or(100) as i32;
        let end_stam = end_stamina.unwrap_or(100) as i32;
        // Net cost: positive means consumed, negative/0 means sustained indefinitely or regenerated
        let stamina_cost_net = start_stam.saturating_sub(end_stam);

        let is_neutral_cycle = cycle_states
            .iter()
            .all(|s| s.starts_with("neutral") || s == "neutral:none");
        let has_escape_opportunity = is_neutral_cycle || min_reaction_window >= 4;
        // Unbounded if not in neutral, has no escape window, and no net stamina depletion
        let is_unbounded = !is_neutral_cycle && !has_escape_opportunity && stamina_cost_net <= 0;

        DetectedCycle {
            actor_id: actor_id.to_string(),
            cycle_states,
            start_frame,
            end_frame,
            cycle_length_frames: end_frame.saturating_sub(start_frame),
            stamina_cost_net,
            min_reaction_window_frames: min_reaction_window,
            has_escape_opportunity,
            is_unbounded,
        }
    }
}
