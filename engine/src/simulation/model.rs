//! Simulation actor models, attack progression, and input commands.

use crate::domain::{Attack, CombatState, CombatStateCategory};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActiveAttackState {
    pub attack: Attack,
    pub frame_in_attack: u32,
    pub hitboxes_activated: BTreeSet<String>,
    pub targets_hit: BTreeSet<String>,
}

impl ActiveAttackState {
    pub fn new(attack: Attack) -> Self {
        Self {
            attack,
            frame_in_attack: 0,
            hitboxes_activated: BTreeSet::new(),
            targets_hit: BTreeSet::new(),
        }
    }

    pub fn is_startup(&self) -> bool {
        self.frame_in_attack < self.attack.startup_frames.value()
    }

    pub fn is_active(&self) -> bool {
        let startup = self.attack.startup_frames.value();
        let active = self.attack.active_frames.value();
        self.frame_in_attack >= startup && self.frame_in_attack < startup + active
    }

    pub fn is_recovery(&self) -> bool {
        let startup = self.attack.startup_frames.value();
        let active = self.attack.active_frames.value();
        self.frame_in_attack >= startup + active
            && self.frame_in_attack < self.attack.total_duration().value()
    }

    pub fn is_finished(&self) -> bool {
        self.frame_in_attack >= self.attack.total_duration().value()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActorState {
    pub actor_id: String,
    pub team: u32,
    pub health: i32,
    pub max_health: i32,
    pub guard: i32,
    pub max_guard: i32,
    pub resources: BTreeMap<String, u32>,
    pub combat_state: CombatState,
    pub active_attack: Option<ActiveAttackState>,
    pub stun_timer: u32,
    pub block_timer: u32,
    pub is_blocking: bool,
    pub is_airborne: bool,
    pub cancel_eligible: bool,
    pub hit_confirmed: bool,
    pub attack_ids: Vec<String>,
}

impl ActorState {
    pub fn new(
        actor_id: impl Into<String>,
        team: u32,
        initial_health: i32,
        attack_ids: Vec<String>,
    ) -> Self {
        let mut resources = BTreeMap::new();
        resources.insert("stamina".to_string(), 100);
        resources.insert("meter".to_string(), 100);

        Self {
            actor_id: actor_id.into(),
            team,
            health: initial_health,
            max_health: initial_health,
            guard: 100,
            max_guard: 100,
            resources,
            combat_state: Self::neutral_state(),
            active_attack: None,
            stun_timer: 0,
            block_timer: 0,
            is_blocking: false,
            is_airborne: false,
            cancel_eligible: false,
            hit_confirmed: false,
            attack_ids,
        }
    }

    pub fn neutral_state() -> CombatState {
        CombatState::new(
            "neutral",
            CombatStateCategory::Neutral,
            true,
            false,
            false,
            true,
        )
        .unwrap()
    }

    pub fn startup_state() -> CombatState {
        CombatState::new(
            "startup",
            CombatStateCategory::Startup,
            false,
            false,
            false,
            true,
        )
        .unwrap()
    }

    pub fn active_state() -> CombatState {
        CombatState::new(
            "active",
            CombatStateCategory::Active,
            false,
            false,
            false,
            true,
        )
        .unwrap()
    }

    pub fn recovery_state() -> CombatState {
        CombatState::new(
            "recovery",
            CombatStateCategory::Recovery,
            false,
            false,
            false,
            true,
        )
        .unwrap()
    }

    pub fn hitstun_state(airborne: bool) -> CombatState {
        CombatState::new(
            "hitstun",
            CombatStateCategory::Hitstun,
            false,
            false,
            airborne,
            !airborne,
        )
        .unwrap()
    }

    pub fn blockstun_state() -> CombatState {
        CombatState::new(
            "blockstun",
            CombatStateCategory::Blockstun,
            false,
            false,
            false,
            true,
        )
        .unwrap()
    }

    pub fn can_act(&self) -> bool {
        self.stun_timer == 0 && self.block_timer == 0 && self.active_attack.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActorCommand {
    pub frame: u32,
    pub actor_id: String,
    pub command: String,
    pub target_id: Option<String>,
}
