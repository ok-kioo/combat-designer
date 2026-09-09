//! Main CombatSimulator orchestrating frame execution loop.

use combat_domain::Attack;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::budget::{BudgetTracker, ExecutionBudget};
use crate::clock::FrameClock;
use crate::events::SimulationEvent;
use crate::metrics::SimulationMetrics;
use crate::model::{ActorCommand, ActorState};
use crate::order::FrameExecutionContext;
use crate::snapshot::SimulationSnapshot;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SimulationStatus {
    Completed,
    BudgetExceeded { reason: String },
    Error { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulationOutput {
    pub status: SimulationStatus,
    pub total_frames: u32,
    pub events: Vec<SimulationEvent>,
    pub final_state_hash: String,
    pub metrics: SimulationMetrics,
    pub snapshots: Vec<SimulationSnapshot>,
}

pub struct SimulationInput {
    pub actors: BTreeMap<String, ActorState>,
    pub attacks: BTreeMap<String, Attack>,
    pub inputs: Vec<ActorCommand>,
    pub budget: ExecutionBudget,
    pub target_frames: u32,
}

pub struct CombatSimulator;

impl CombatSimulator {
    pub fn simulate(mut input: SimulationInput) -> SimulationOutput {
        let mut tracker = match BudgetTracker::new(input.budget, input.actors.len()) {
            Ok(t) => t,
            Err(reason) => {
                return SimulationOutput {
                    status: SimulationStatus::BudgetExceeded {
                        reason: reason.to_string(),
                    },
                    total_frames: 0,
                    events: Vec::new(),
                    final_state_hash: String::new(),
                    metrics: SimulationMetrics::default(),
                    snapshots: Vec::new(),
                };
            }
        };

        let mut clock = FrameClock::new(0);
        let mut sequence: u64 = 0;
        let mut global_events: Vec<SimulationEvent> = Vec::new();
        let mut snapshots: Vec<SimulationSnapshot> = Vec::new();
        let mut metrics = SimulationMetrics::default();

        let mut exit_status = SimulationStatus::Completed;

        while clock.current_frame() < input.target_frames {
            let current_frame = clock.current_frame();

            // Verify budget before advancing frame
            if let Err(reason) = tracker.check_frame_advance() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            let mut ctx = FrameExecutionContext::new(
                current_frame,
                &mut input.actors,
                &input.attacks,
                &input.inputs,
                &mut tracker,
                &mut sequence,
                &mut metrics,
            );

            // 1. apply_inputs
            if let Err(reason) = ctx.step_1_apply_inputs() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 2. update_timers
            if let Err(reason) = ctx.step_2_update_timers() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 3, 4, 5. resolve_hitboxes, resolve_block, apply_hit_reactions
            if let Err(reason) = ctx.step_3_4_5_resolve_hits() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 6. resolve_cancel_windows
            if let Err(reason) = ctx.step_6_resolve_cancel_windows() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 7. update_resources
            if let Err(reason) = ctx.step_7_update_resources() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 8. resolve_state_transitions
            if let Err(reason) = ctx.step_8_resolve_state_transitions() {
                exit_status = SimulationStatus::BudgetExceeded {
                    reason: reason.to_string(),
                };
                break;
            }

            // 9. finalize_event_batch
            ctx.step_9_finalize_event_batch(&mut global_events);

            // 10. snapshot
            let snap = ctx.step_10_snapshot();
            snapshots.push(snap);

            clock.advance();
        }

        metrics.total_frames = clock.current_frame();
        let final_state_hash = snapshots
            .last()
            .map(|s| s.state_hash.clone())
            .unwrap_or_default();

        SimulationOutput {
            status: exit_status,
            total_frames: clock.current_frame(),
            events: global_events,
            final_state_hash,
            metrics,
            snapshots,
        }
    }
}
