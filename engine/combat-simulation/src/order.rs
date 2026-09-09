//! The 10-step contract frame execution loop.
//!
//! Contract execution order per frame:
//! 1. apply_inputs
//! 2. update_timers
//! 3. resolve_hitboxes
//! 4. resolve_block
//! 5. apply_hit_reactions
//! 6. resolve_cancel_windows
//! 7. update_resources
//! 8. resolve_state_transitions
//! 9. finalize_event_batch
//! 10. snapshot

use crate::budget::{BudgetExceededReason, BudgetTracker};
use crate::events::{SimulationEvent, SimulationEventType};
use crate::metrics::SimulationMetrics;
use crate::model::{ActiveAttackState, ActorCommand, ActorState};
use crate::snapshot::SimulationSnapshot;
use combat_domain::{CancelCondition, Frame, HitboxType};
use std::collections::BTreeMap;

pub struct FrameExecutionContext<'a> {
    pub frame: u32,
    pub actors: &'a mut BTreeMap<String, ActorState>,
    pub attacks: &'a BTreeMap<String, combat_domain::Attack>,
    pub inputs: &'a [ActorCommand],
    pub tracker: &'a mut BudgetTracker,
    pub sequence: &'a mut u64,
    pub frame_events: Vec<SimulationEvent>,
    pub metrics: &'a mut SimulationMetrics,
}

#[derive(Debug, Clone)]
struct HitCandidate {
    attacker_id: String,
    attack_id: String,
    target_id: String,
    _hitbox_id: String,
    hitbox_type: HitboxType,
    damage: u32,
    chip_damage: u32,
    guard_break_value: u32,
    hitstun_frames: u32,
    blockstun_frames: u32,
    launch: bool,
}

impl<'a> FrameExecutionContext<'a> {
    pub fn new(
        frame: u32,
        actors: &'a mut BTreeMap<String, ActorState>,
        attacks: &'a BTreeMap<String, combat_domain::Attack>,
        inputs: &'a [ActorCommand],
        tracker: &'a mut BudgetTracker,
        sequence: &'a mut u64,
        metrics: &'a mut SimulationMetrics,
    ) -> Self {
        Self {
            frame,
            actors,
            attacks,
            inputs,
            tracker,
            sequence,
            frame_events: Vec::new(),
            metrics,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn emit_event_static(
        frame: u32,
        tracker: &mut BudgetTracker,
        sequence: &mut u64,
        frame_events: &mut Vec<SimulationEvent>,
        actor_id: &str,
        event_type: SimulationEventType,
        attack_id: Option<String>,
        target_id: Option<String>,
    ) -> Result<(), BudgetExceededReason> {
        tracker.record_event()?;
        *sequence += 1;
        let mut event = SimulationEvent::new(frame, actor_id, event_type, *sequence);
        event.attack_id = attack_id;
        event.target_id = target_id;
        frame_events.push(event);
        Ok(())
    }

    fn emit_event(
        &mut self,
        actor_id: &str,
        event_type: SimulationEventType,
        attack_id: Option<String>,
        target_id: Option<String>,
    ) -> Result<(), BudgetExceededReason> {
        Self::emit_event_static(
            self.frame,
            self.tracker,
            self.sequence,
            &mut self.frame_events,
            actor_id,
            event_type,
            attack_id,
            target_id,
        )
    }

    /// Step 1: apply_inputs
    pub fn step_1_apply_inputs(&mut self) -> Result<(), BudgetExceededReason> {
        let frame = self.frame;
        // Collect relevant commands for this frame sorted by actor_id
        let mut current_commands: Vec<ActorCommand> = self
            .inputs
            .iter()
            .filter(|cmd| cmd.frame == frame)
            .cloned()
            .collect();
        current_commands.sort_by(|a, b| {
            a.actor_id
                .cmp(&b.actor_id)
                .then_with(|| a.command.cmp(&b.command))
        });

        for cmd in current_commands {
            if let Some(actor) = self.actors.get_mut(&cmd.actor_id) {
                if cmd.command == "block" {
                    actor.is_blocking = true;
                    Self::emit_event_static(
                        frame,
                        self.tracker,
                        self.sequence,
                        &mut self.frame_events,
                        &cmd.actor_id,
                        SimulationEventType::StateChanged,
                        None,
                        None,
                    )?;
                } else if cmd.command == "release_block" {
                    actor.is_blocking = false;
                    Self::emit_event_static(
                        frame,
                        self.tracker,
                        self.sequence,
                        &mut self.frame_events,
                        &cmd.actor_id,
                        SimulationEventType::StateChanged,
                        None,
                        None,
                    )?;
                } else if let Some(attack) = self.attacks.get(&cmd.command) {
                    // Check if actor can initiate a new attack
                    if actor.can_act() {
                        // Check resource costs
                        let mut can_afford = true;
                        for cost in &attack.resource_costs {
                            let res_name = match cost.resource_type {
                                combat_domain::ResourceType::Stamina => "stamina",
                                combat_domain::ResourceType::Mana => "mana",
                                combat_domain::ResourceType::Meter => "meter",
                                combat_domain::ResourceType::Health => "health",
                                combat_domain::ResourceType::Custom(ref s) => s.as_str(),
                            };
                            let current_val = actor.resources.get(res_name).copied().unwrap_or(0);
                            if current_val < cost.amount {
                                can_afford = false;
                                break;
                            }
                        }

                        if can_afford {
                            // Deduct immediate resource costs (cost_frame == 0)
                            for cost in &attack.resource_costs {
                                if cost.cost_frame.value() == 0 {
                                    let res_name = match cost.resource_type {
                                        combat_domain::ResourceType::Stamina => "stamina",
                                        combat_domain::ResourceType::Mana => "mana",
                                        combat_domain::ResourceType::Meter => "meter",
                                        combat_domain::ResourceType::Health => "health",
                                        combat_domain::ResourceType::Custom(ref s) => s.as_str(),
                                    };
                                    let current_val =
                                        actor.resources.entry(res_name.to_string()).or_insert(0);
                                    *current_val = current_val.saturating_sub(cost.amount);
                                    self.metrics.resource_spent += cost.amount;
                                    Self::emit_event_static(
                                        frame,
                                        self.tracker,
                                        self.sequence,
                                        &mut self.frame_events,
                                        &cmd.actor_id,
                                        SimulationEventType::ResourceSpent,
                                        Some(attack.id.to_string()),
                                        None,
                                    )?;
                                }
                            }

                            actor.active_attack = Some(ActiveAttackState::new(attack.clone()));
                            actor.combat_state = ActorState::startup_state();
                            actor.cancel_eligible = false;
                            actor.hit_confirmed = false;
                            self.tracker.record_transition()?;
                            self.metrics.state_transitions += 1;

                            Self::emit_event_static(
                                frame,
                                self.tracker,
                                self.sequence,
                                &mut self.frame_events,
                                &cmd.actor_id,
                                SimulationEventType::AttackStarted,
                                Some(attack.id.to_string()),
                                cmd.target_id,
                            )?;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Step 2: update_timers
    pub fn step_2_update_timers(&mut self) -> Result<(), BudgetExceededReason> {
        for actor in self.actors.values_mut() {
            if actor.stun_timer > 0 {
                actor.stun_timer -= 1;
                self.metrics.stun_frames += 1;
                if actor.stun_timer == 0 && actor.active_attack.is_none() {
                    actor.combat_state = ActorState::neutral_state();
                    actor.is_airborne = false;
                }
            }
            if actor.block_timer > 0 {
                actor.block_timer -= 1;
                if actor.block_timer == 0 && actor.active_attack.is_none() {
                    actor.combat_state = ActorState::neutral_state();
                }
            }
            if let Some(ref mut atk) = actor.active_attack {
                atk.frame_in_attack += 1;
                if atk.is_recovery() {
                    self.metrics.recovery_frames += 1;
                }
            }
        }
        Ok(())
    }

    /// Step 3: resolve_hitboxes
    fn collect_hit_candidates(&mut self) -> Result<Vec<HitCandidate>, BudgetExceededReason> {
        let mut candidates = Vec::new();

        // Deterministic iteration over actors (sorted by actor_id)
        let actor_keys: Vec<String> = self.actors.keys().cloned().collect();
        for atk_id in &actor_keys {
            let (frame_in_attack, active_attack_clone) = {
                let actor = match self.actors.get(atk_id) {
                    Some(a) => a,
                    None => continue,
                };
                match &actor.active_attack {
                    Some(atk) => (atk.frame_in_attack, atk.attack.clone()),
                    None => continue,
                }
            };

            let atk_actor_team = self.actors[atk_id].team;

            for hitbox in &active_attack_clone.hitboxes {
                let current_f = Frame::new(frame_in_attack);
                if hitbox.active_window.contains(current_f) {
                    // Check if newly activated
                    let is_new = {
                        let actor = self.actors.get_mut(atk_id).unwrap();
                        let atk_state = actor.active_attack.as_mut().unwrap();
                        atk_state.hitboxes_activated.insert(hitbox.id.clone())
                    };
                    if is_new {
                        self.emit_event(
                            atk_id,
                            SimulationEventType::HitboxActivated,
                            Some(active_attack_clone.id.to_string()),
                            None,
                        )?;
                    }

                    // Check potential targets (opposing team)
                    for target_id in &actor_keys {
                        if target_id == atk_id {
                            continue;
                        }
                        let target_team = self.actors[target_id].team;
                        if target_team == atk_actor_team {
                            continue;
                        }

                        let target_already_hit = {
                            let actor = &self.actors[atk_id];
                            actor
                                .active_attack
                                .as_ref()
                                .unwrap()
                                .targets_hit
                                .contains(target_id)
                        };

                        if !target_already_hit {
                            self.emit_event(
                                atk_id,
                                SimulationEventType::HitDetected,
                                Some(active_attack_clone.id.to_string()),
                                Some(target_id.clone()),
                            )?;

                            candidates.push(HitCandidate {
                                attacker_id: atk_id.clone(),
                                attack_id: active_attack_clone.id.to_string(),
                                target_id: target_id.clone(),
                                _hitbox_id: hitbox.id.clone(),
                                hitbox_type: hitbox.hitbox_type.clone(),
                                damage: active_attack_clone.damage,
                                chip_damage: active_attack_clone.chip_damage,
                                guard_break_value: active_attack_clone.guard_break_value,
                                hitstun_frames: active_attack_clone.hitstun_frames.value(),
                                blockstun_frames: active_attack_clone.blockstun_frames.value(),
                                launch: hitbox.launch,
                            });
                        }
                    }
                }
            }
        }

        // Sort candidates deterministically by (attacker_id, attack_id, target_id)
        candidates.sort_by(|a, b| {
            a.attacker_id
                .cmp(&b.attacker_id)
                .then_with(|| a.attack_id.cmp(&b.attack_id))
                .then_with(|| a.target_id.cmp(&b.target_id))
        });

        Ok(candidates)
    }

    /// Step 4 & 5: resolve_block & apply_hit_reactions
    pub fn step_3_4_5_resolve_hits(&mut self) -> Result<(), BudgetExceededReason> {
        let candidates = self.collect_hit_candidates()?;

        for hit in candidates {
            // Check defender state
            let (is_blocking, guard, is_invulnerable) = {
                let defender = match self.actors.get(&hit.target_id) {
                    Some(d) => d,
                    None => continue,
                };
                (
                    defender.is_blocking,
                    defender.guard,
                    defender.combat_state.invulnerable,
                )
            };

            if is_invulnerable {
                // Invulnerable defender evades hit
                self.metrics.misses += 1;
                continue;
            }

            let is_throw = hit.hitbox_type == HitboxType::Throw;
            let blocked = !is_throw && is_blocking;

            if blocked {
                // Block confirmed
                let guard_broken = guard <= 0
                    || (hit.guard_break_value > 0 && guard <= (hit.guard_break_value as i32));

                if guard_broken {
                    self.emit_event(
                        &hit.target_id,
                        SimulationEventType::GuardBroken,
                        Some(hit.attack_id.clone()),
                        Some(hit.attacker_id.clone()),
                    )?;

                    // Treat as full hit
                    let defender = self.actors.get_mut(&hit.target_id).unwrap();
                    defender.guard = 0;
                    defender.health = defender.health.saturating_sub(hit.damage as i32);
                    defender.stun_timer = hit.hitstun_frames;
                    defender.combat_state = ActorState::hitstun_state(hit.launch);
                    if hit.launch {
                        defender.is_airborne = true;
                        self.metrics.launch_count += 1;
                    }

                    self.metrics.damage += hit.damage;
                    self.metrics.hits += 1;
                    self.emit_event(
                        &hit.target_id,
                        SimulationEventType::HitstunApplied,
                        Some(hit.attack_id.clone()),
                        Some(hit.attacker_id.clone()),
                    )?;
                } else {
                    // Block absorbed with chip damage
                    let defender = self.actors.get_mut(&hit.target_id).unwrap();
                    defender.health = defender.health.saturating_sub(hit.chip_damage as i32);
                    defender.guard = defender.guard.saturating_sub(hit.guard_break_value as i32);
                    defender.block_timer = hit.blockstun_frames;
                    defender.combat_state = ActorState::blockstun_state();

                    self.metrics.damage += hit.chip_damage;
                    self.metrics.blocked_hits += 1;

                    self.emit_event(
                        &hit.target_id,
                        SimulationEventType::BlockConfirmed,
                        Some(hit.attack_id.clone()),
                        Some(hit.attacker_id.clone()),
                    )?;
                    self.emit_event(
                        &hit.target_id,
                        SimulationEventType::BlockstunApplied,
                        Some(hit.attack_id.clone()),
                        Some(hit.attacker_id.clone()),
                    )?;
                }
            } else {
                // Direct Hit Confirmed
                let defender = self.actors.get_mut(&hit.target_id).unwrap();
                defender.health = defender.health.saturating_sub(hit.damage as i32);
                defender.stun_timer = hit.hitstun_frames;
                defender.combat_state = ActorState::hitstun_state(hit.launch);
                if hit.launch {
                    defender.is_airborne = true;
                    self.metrics.launch_count += 1;
                }

                self.metrics.damage += hit.damage;
                self.metrics.hits += 1;

                self.emit_event(
                    &hit.attacker_id,
                    SimulationEventType::HitConfirmed,
                    Some(hit.attack_id.clone()),
                    Some(hit.target_id.clone()),
                )?;
                self.emit_event(
                    &hit.target_id,
                    SimulationEventType::HitstunApplied,
                    Some(hit.attack_id.clone()),
                    Some(hit.attacker_id.clone()),
                )?;
            }

            // Mark attacker hit confirmed and target recorded
            if let Some(attacker) = self.actors.get_mut(&hit.attacker_id) {
                attacker.hit_confirmed = true;
                if let Some(ref mut atk_state) = attacker.active_attack {
                    atk_state.targets_hit.insert(hit.target_id.clone());
                }
            }
        }

        Ok(())
    }

    /// Step 6: resolve_cancel_windows
    pub fn step_6_resolve_cancel_windows(&mut self) -> Result<(), BudgetExceededReason> {
        let frame = self.frame;
        let actor_keys: Vec<String> = self.actors.keys().cloned().collect();

        for actor_id in actor_keys {
            let (frame_in_attack, hit_confirmed, attack_clone) = {
                let actor = match self.actors.get(&actor_id) {
                    Some(a) => a,
                    None => continue,
                };
                match &actor.active_attack {
                    Some(atk) => (atk.frame_in_attack, actor.hit_confirmed, atk.attack.clone()),
                    None => continue,
                }
            };

            for cancel in &attack_clone.cancels {
                let current_f = Frame::new(frame_in_attack);
                if cancel.window.contains(current_f) {
                    let eligible = match cancel.condition {
                        CancelCondition::OnHit => hit_confirmed,
                        CancelCondition::OnBlock => false,
                        CancelCondition::OnWhiff => !hit_confirmed,
                        CancelCondition::Always => true,
                    };

                    if eligible {
                        if let Some(actor) = self.actors.get_mut(&actor_id) {
                            actor.cancel_eligible = true;
                        }
                        self.emit_event(
                            &actor_id,
                            SimulationEventType::CancelOpened,
                            Some(attack_clone.id.to_string()),
                            None,
                        )?;

                        // Check if an input exists targeting cancel.target_action
                        let wants_cancel = self.inputs.iter().any(|cmd| {
                            cmd.frame == frame
                                && cmd.actor_id == actor_id
                                && cmd.command == cancel.target_action
                        });

                        if wants_cancel {
                            if let Some(next_attack) = self.attacks.get(&cancel.target_action) {
                                let actor = self.actors.get_mut(&actor_id).unwrap();
                                actor.active_attack =
                                    Some(ActiveAttackState::new(next_attack.clone()));
                                actor.combat_state = ActorState::startup_state();
                                actor.cancel_eligible = false;
                                actor.hit_confirmed = false;
                                self.metrics.cancel_count += 1;
                                self.tracker.record_transition()?;

                                self.emit_event(
                                    &actor_id,
                                    SimulationEventType::CancelExecuted,
                                    Some(attack_clone.id.to_string()),
                                    Some(next_attack.id.to_string()),
                                )?;
                                self.emit_event(
                                    &actor_id,
                                    SimulationEventType::AttackStarted,
                                    Some(next_attack.id.to_string()),
                                    None,
                                )?;
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Step 7: update_resources
    pub fn step_7_update_resources(&mut self) -> Result<(), BudgetExceededReason> {
        let mut total_remaining = 0;
        for actor in self.actors.values_mut() {
            for val in actor.resources.values() {
                total_remaining += val;
            }
        }
        self.metrics.resource_remaining = total_remaining;
        Ok(())
    }

    /// Step 8: resolve_state_transitions
    pub fn step_8_resolve_state_transitions(&mut self) -> Result<(), BudgetExceededReason> {
        let actor_keys: Vec<String> = self.actors.keys().cloned().collect();

        for actor_id in actor_keys {
            let mut recovered_attack_id: Option<String> = None;

            if let Some(actor) = self.actors.get_mut(&actor_id) {
                if let Some(ref atk) = actor.active_attack {
                    if atk.is_finished() {
                        recovered_attack_id = Some(atk.attack.id.to_string());
                        actor.active_attack = None;
                        actor.combat_state = ActorState::neutral_state();
                        actor.cancel_eligible = false;
                        actor.hit_confirmed = false;
                        self.tracker.record_transition()?;
                        self.metrics.state_transitions += 1;
                    } else if atk.is_active() && actor.combat_state.id != "active" {
                        actor.combat_state = ActorState::active_state();
                        self.tracker.record_transition()?;
                        self.metrics.state_transitions += 1;
                    } else if atk.is_recovery() && actor.combat_state.id != "recovery" {
                        actor.combat_state = ActorState::recovery_state();
                        self.tracker.record_transition()?;
                        self.metrics.state_transitions += 1;
                    }
                }
            }

            if let Some(atk_id) = recovered_attack_id {
                self.emit_event(
                    &actor_id,
                    SimulationEventType::AttackRecovered,
                    Some(atk_id),
                    None,
                )?;
                self.emit_event(&actor_id, SimulationEventType::StateChanged, None, None)?;
            }
        }

        Ok(())
    }

    /// Step 9: finalize_event_batch
    pub fn step_9_finalize_event_batch(&mut self, global_events: &mut Vec<SimulationEvent>) {
        // Deterministically sort frame events by (frame, actor_id, attack_id, sequence)
        self.frame_events.sort();
        global_events.append(&mut self.frame_events);
    }

    /// Step 10: snapshot
    pub fn step_10_snapshot(&self) -> SimulationSnapshot {
        SimulationSnapshot::new(self.frame, self.actors)
    }
}
