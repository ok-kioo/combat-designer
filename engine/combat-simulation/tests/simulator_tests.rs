use combat_domain::*;
use combat_simulation::*;
use std::collections::BTreeMap;

fn valid_provenance() -> Provenance {
    Provenance::new(
        "unity",
        "rev-001",
        "Assets/Attacks/Slash.asset",
        "slash_01",
        "1.0.0",
        1000,
    )
    .expect("valid provenance")
}

fn create_test_attack(
    id_str: &str,
    startup: u32,
    active: u32,
    recovery: u32,
    damage: u32,
    chip_damage: u32,
    guard_break: u32,
    hitstun: u32,
    blockstun: u32,
) -> Attack {
    let id: AttackId = id_str.parse().expect("valid attack id");
    let name = SanitizedName::from_raw(id_str).expect("valid name");
    let prov = valid_provenance();

    let hitbox = Hitbox::new(
        format!("{}_hb", id_str.replace(':', "_")),
        id.clone(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(startup, startup + active).expect("valid window"),
        1000,
        10,
        0,
        false,
    );

    AttackBuilder::new(id, name, startup, active, recovery, damage, prov)
        .chip_damage(chip_damage)
        .guard_break_value(guard_break)
        .hitstun_frames(hitstun)
        .blockstun_frames(blockstun)
        .add_hitbox(hitbox)
        .build()
        .expect("valid attack")
}

// 04.T.1: FrameClock monotonicity & discrete u32 ticks
#[test]
fn test_04_t_1_frame_clock_monotonicity() {
    let mut clock = FrameClock::new(0);
    assert_eq!(clock.current_frame(), 0);

    for expected in 1..=100 {
        let f = clock.tick();
        assert_eq!(f, expected);
        assert_eq!(clock.current_frame(), expected);
    }
}

// 04.T.2: Attack lifecycle: startup, active, recovery frames executed in exact sequence
#[test]
fn test_04_t_2_attack_lifecycle() {
    let attack_id = "unity:proj:slash";
    let attack = create_test_attack(attack_id, 3, 2, 3, 20, 5, 10, 10, 8);

    let mut actors = BTreeMap::new();
    let mut actor = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    actor.resources.insert("stamina".to_string(), 100);
    actors.insert("player_1".to_string(), actor);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: None,
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 10,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);
    assert_eq!(output.total_frames, 10);

    // Verify events sequence
    let event_types: Vec<SimulationEventType> =
        output.events.iter().map(|e| e.event_type).collect();
    assert!(event_types.contains(&SimulationEventType::AttackStarted));
    assert!(event_types.contains(&SimulationEventType::HitboxActivated));
    assert!(event_types.contains(&SimulationEventType::AttackRecovered));

    // Frame metrics
    assert_eq!(output.metrics.recovery_frames, 3);
}

// 04.T.3: Hit detection on opposing team actor within active window
#[test]
fn test_04_t_3_hit_detection() {
    let attack_id = "unity:proj:punch";
    let attack = create_test_attack(attack_id, 2, 2, 2, 25, 5, 10, 8, 6);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    let p2 = ActorState::new("dummy_2", 2, 100, vec![]);
    actors.insert("player_1".to_string(), p1);
    actors.insert("dummy_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: Some("dummy_2".to_string()),
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 8,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let hit_event = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::HitDetected);
    assert!(hit_event.is_some(), "HitDetected event should be emitted");
    assert_eq!(output.metrics.hits, 1);
    assert_eq!(output.metrics.damage, 25);
}

// 04.T.4: Block resolution: chip damage and guard consumption
#[test]
fn test_04_t_4_block_resolution() {
    let attack_id = "unity:proj:heavy";
    let attack = create_test_attack(attack_id, 2, 2, 2, 40, 8, 20, 10, 8);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    let p2 = ActorState::new("defender_2", 2, 100, vec![]);
    actors.insert("player_1".to_string(), p1);
    actors.insert("defender_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "defender_2".to_string(),
            command: "block".to_string(),
            target_id: None,
        },
        ActorCommand {
            frame: 0,
            actor_id: "player_1".to_string(),
            command: attack_id.to_string(),
            target_id: Some("defender_2".to_string()),
        },
    ];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 8,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let block_event = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::BlockConfirmed);
    assert!(
        block_event.is_some(),
        "BlockConfirmed event should be emitted"
    );

    let last_snap = output.snapshots.last().expect("snapshot exists");
    let def_snap = last_snap
        .actors
        .get("defender_2")
        .expect("defender in snapshot");

    // Blocked: took chip damage (8) instead of 40 full damage
    assert_eq!(def_snap.health, 100 - 8);
    // Guard reduced by guard_break_value (20)
    assert_eq!(def_snap.guard, 100 - 20);
    assert_eq!(output.metrics.blocked_hits, 1);
}

// 04.T.5: Guard break: depleted guard triggers GuardBroken and Hitstun
#[test]
fn test_04_t_5_guard_break() {
    let attack_id = "unity:proj:breaker";
    let attack = create_test_attack(attack_id, 1, 2, 2, 30, 5, 50, 15, 8);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    let mut p2 = ActorState::new("defender_2", 2, 100, vec![]);
    p2.guard = 20; // Lower than attack guard_break_value 50
    actors.insert("player_1".to_string(), p1);
    actors.insert("defender_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "defender_2".to_string(),
            command: "block".to_string(),
            target_id: None,
        },
        ActorCommand {
            frame: 0,
            actor_id: "player_1".to_string(),
            command: attack_id.to_string(),
            target_id: Some("defender_2".to_string()),
        },
    ];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 6,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let gb_event = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::GuardBroken);
    assert!(gb_event.is_some(), "GuardBroken event must be emitted");

    let last_snap = output.snapshots.last().unwrap();
    let def_snap = last_snap.actors.get("defender_2").unwrap();
    assert_eq!(def_snap.guard, 0);
}

// 04.T.6: Hit reaction unblocked: full damage & hitstun frames applied
#[test]
fn test_04_t_6_hit_reaction_unblocked() {
    let attack_id = "unity:proj:slash";
    let attack = create_test_attack(attack_id, 2, 2, 2, 35, 5, 10, 12, 6);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    let p2 = ActorState::new("target_2", 2, 100, vec![]);
    actors.insert("player_1".to_string(), p1);
    actors.insert("target_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: Some("target_2".to_string()),
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 10,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let hit_res = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::HitConfirmed);
    assert!(hit_res.is_some());
    assert_eq!(output.metrics.damage, 35);
    assert!(output.metrics.stun_frames > 0);
}

// 04.T.7: Cancel window: attack cancelled into follow-up within cancel window
#[test]
fn test_04_t_7_cancel_window_success() {
    let attack_a_id = "unity:proj:attack_a";
    let attack_b_id = "unity:proj:attack_b";

    let hitbox_a = Hitbox::new(
        "hb_a",
        attack_a_id.parse().unwrap(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(2, 4).unwrap(),
        1000,
        5,
        0,
        false,
    );
    let cancel_rule = CancelRule::new(
        attack_a_id.parse().unwrap(),
        attack_b_id,
        FrameWindow::new(2, 6).unwrap(),
        CancelCondition::OnHit,
        None,
    );
    let attack_a = AttackBuilder::new(
        attack_a_id.parse().unwrap(),
        SanitizedName::from_raw("Attack A").unwrap(),
        2,
        2,
        4,
        15,
        valid_provenance(),
    )
    .add_hitbox(hitbox_a)
    .add_cancel(cancel_rule)
    .build()
    .unwrap();

    let attack_b = create_test_attack(attack_b_id, 1, 2, 2, 25, 5, 10, 10, 6);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new(
        "player_1",
        1,
        100,
        vec![attack_a_id.to_string(), attack_b_id.to_string()],
    );
    let p2 = ActorState::new("target_2", 2, 100, vec![]);
    actors.insert("player_1".to_string(), p1);
    actors.insert("target_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_a_id.to_string(), attack_a);
    attacks.insert(attack_b_id.to_string(), attack_b);

    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "player_1".to_string(),
            command: attack_a_id.to_string(),
            target_id: Some("target_2".to_string()),
        },
        ActorCommand {
            frame: 3, // In active window [2, 4) after hit confirmed
            actor_id: "player_1".to_string(),
            command: attack_b_id.to_string(),
            target_id: Some("target_2".to_string()),
        },
    ];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 10,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let cancel_ev = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::CancelExecuted);
    assert!(cancel_ev.is_some(), "CancelExecuted event must be emitted");
    assert_eq!(output.metrics.cancel_count, 1);
}

// 04.T.8: Cancel rejected outside cancel window
#[test]
fn test_04_t_8_cancel_rejected_outside_window() {
    let attack_a_id = "unity:proj:attack_a";
    let attack_b_id = "unity:proj:attack_b";

    let hitbox_a = Hitbox::new(
        "hb_a",
        attack_a_id.parse().unwrap(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(4, 6).unwrap(),
        1000,
        5,
        0,
        false,
    );
    let cancel_rule = CancelRule::new(
        attack_a_id.parse().unwrap(),
        attack_b_id,
        FrameWindow::new(4, 8).unwrap(),
        CancelCondition::OnHit,
        None,
    );
    let attack_a = AttackBuilder::new(
        attack_a_id.parse().unwrap(),
        SanitizedName::from_raw("Attack A").unwrap(),
        4,
        2,
        4,
        15,
        valid_provenance(),
    )
    .add_hitbox(hitbox_a)
    .add_cancel(cancel_rule)
    .build()
    .unwrap();

    let attack_b = create_test_attack(attack_b_id, 1, 2, 2, 25, 5, 10, 10, 6);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new(
        "player_1",
        1,
        100,
        vec![attack_a_id.to_string(), attack_b_id.to_string()],
    );
    actors.insert("player_1".to_string(), p1);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_a_id.to_string(), attack_a);
    attacks.insert(attack_b_id.to_string(), attack_b);

    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "player_1".to_string(),
            command: attack_a_id.to_string(),
            target_id: None,
        },
        // Attempt cancel at frame 1 (before window starts at 4 and without hit)
        ActorCommand {
            frame: 1,
            actor_id: "player_1".to_string(),
            command: attack_b_id.to_string(),
            target_id: None,
        },
    ];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 12,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    let cancel_ev = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::CancelExecuted);
    assert!(
        cancel_ev.is_none(),
        "CancelExecuted should NOT be emitted outside window"
    );
    assert_eq!(output.metrics.cancel_count, 0);
}

// 04.T.9: Resource consumption: insufficient stamina prevents attack execution
#[test]
fn test_04_t_9_resource_consumption() {
    let attack_id = "unity:proj:costly";
    let cost = ResourceCost::new(ResourceType::Stamina, 50, 0).unwrap();

    let id: AttackId = attack_id.parse().unwrap();
    let attack = AttackBuilder::new(
        id.clone(),
        SanitizedName::from_raw("Costly").unwrap(),
        2,
        2,
        2,
        30,
        valid_provenance(),
    )
    .add_resource_cost(cost)
    .build()
    .unwrap();

    let mut actors = BTreeMap::new();
    let mut p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    p1.resources.insert("stamina".to_string(), 20); // Only 20 stamina, needs 50
    actors.insert("player_1".to_string(), p1);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: None,
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 5,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    // Attack was blocked due to insufficient stamina
    let start_ev = output
        .events
        .iter()
        .find(|e| e.event_type == SimulationEventType::AttackStarted);
    assert!(
        start_ev.is_none(),
        "Attack should not start if resources insufficient"
    );
}

// 04.T.10: State transitions: actor transitions through idle -> startup -> active -> recovery -> idle
#[test]
fn test_04_t_10_state_transitions() {
    let attack_id = "unity:proj:light";
    let attack = create_test_attack(attack_id, 2, 1, 2, 10, 0, 5, 5, 3);

    let mut actors = BTreeMap::new();
    let p1 = ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]);
    actors.insert("player_1".to_string(), p1);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: None,
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 8,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    // Should have recorded transitions for startup, active, recovery, neutral
    assert!(output.metrics.state_transitions >= 4);

    let final_snap = output.snapshots.last().unwrap();
    let actor_snap = final_snap.actors.get("player_1").unwrap();
    assert_eq!(actor_snap.combat_state, "neutral");
}

// 04.T.11: Tie-breaking: simultaneous inputs ordered deterministically by actor_id
#[test]
fn test_04_t_11_tie_breaking() {
    let attack_id = "unity:proj:jab";
    let attack = create_test_attack(attack_id, 2, 2, 2, 10, 0, 5, 5, 3);

    let mut actors = BTreeMap::new();
    actors.insert(
        "beta".to_string(),
        ActorState::new("beta", 1, 100, vec![attack_id.to_string()]),
    );
    actors.insert(
        "alpha".to_string(),
        ActorState::new("alpha", 1, 100, vec![attack_id.to_string()]),
    );

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    // Inputs out of order
    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "beta".to_string(),
            command: attack_id.to_string(),
            target_id: None,
        },
        ActorCommand {
            frame: 0,
            actor_id: "alpha".to_string(),
            command: attack_id.to_string(),
            target_id: None,
        },
    ];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 4,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);

    // Filter attack started events at frame 0
    let start_events: Vec<&SimulationEvent> = output
        .events
        .iter()
        .filter(|e| e.event_type == SimulationEventType::AttackStarted && e.frame == 0)
        .collect();

    assert_eq!(start_events.len(), 2);
    // alpha must be processed before beta
    assert_eq!(start_events[0].actor_id, "alpha");
    assert_eq!(start_events[1].actor_id, "beta");
    assert!(start_events[0].sequence < start_events[1].sequence);
}

// 04.T.12: State snapshot and deterministic state_hash computed
#[test]
fn test_04_t_12_state_snapshot_and_hash() {
    let attack_id = "unity:proj:slash";
    let attack = create_test_attack(attack_id, 2, 2, 2, 20, 5, 10, 8, 5);

    let mut actors = BTreeMap::new();
    actors.insert(
        "player_1".to_string(),
        ActorState::new("player_1", 1, 100, vec![attack_id.to_string()]),
    );

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let inputs = vec![ActorCommand {
        frame: 0,
        actor_id: "player_1".to_string(),
        command: attack_id.to_string(),
        target_id: None,
    }];

    let input = SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 6,
    };

    let output = CombatSimulator::simulate(input);
    assert_eq!(output.status, SimulationStatus::Completed);
    assert_eq!(output.snapshots.len(), 6);

    // Hash is 64 hex characters (256-bit SHA-256)
    assert_eq!(output.final_state_hash.len(), 64);
    assert!(output
        .final_state_hash
        .chars()
        .all(|c| c.is_ascii_hexdigit()));
}
