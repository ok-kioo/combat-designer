use combat_engine::domain::*;
use combat_engine::simulation::*;
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

fn build_scenario_input() -> SimulationInput {
    let attack_a_id = "unity:proj:combo_a";
    let attack_b_id = "unity:proj:combo_b";

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
        SanitizedName::from_raw("Combo A").unwrap(),
        2,
        2,
        4,
        20,
        valid_provenance(),
    )
    .hitstun_frames(10)
    .blockstun_frames(6)
    .chip_damage(5)
    .guard_break_value(15)
    .add_hitbox(hitbox_a)
    .add_cancel(cancel_rule)
    .build()
    .unwrap();

    let hitbox_b = Hitbox::new(
        "hb_b",
        attack_b_id.parse().unwrap(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(1, 3).unwrap(),
        1000,
        10,
        0,
        false,
    );

    let attack_b = AttackBuilder::new(
        attack_b_id.parse().unwrap(),
        SanitizedName::from_raw("Combo B").unwrap(),
        1,
        2,
        3,
        30,
        valid_provenance(),
    )
    .hitstun_frames(12)
    .blockstun_frames(8)
    .chip_damage(8)
    .guard_break_value(25)
    .add_hitbox(hitbox_b)
    .build()
    .unwrap();

    let mut actors = BTreeMap::new();
    let mut p1 = ActorState::new(
        "player_1",
        1,
        100,
        vec![attack_a_id.to_string(), attack_b_id.to_string()],
    );
    p1.resources.insert("stamina".to_string(), 100);
    actors.insert("player_1".to_string(), p1);

    let p2 = ActorState::new("player_2", 2, 100, vec![]);
    actors.insert("player_2".to_string(), p2);

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_a_id.to_string(), attack_a);
    attacks.insert(attack_b_id.to_string(), attack_b);

    let inputs = vec![
        ActorCommand {
            frame: 0,
            actor_id: "player_1".to_string(),
            command: attack_a_id.to_string(),
            target_id: Some("player_2".to_string()),
        },
        ActorCommand {
            frame: 3, // Cancel into combo_b
            actor_id: "player_1".to_string(),
            command: attack_b_id.to_string(),
            target_id: Some("player_2".to_string()),
        },
    ];

    SimulationInput {
        actors,
        attacks,
        inputs,
        budget: ExecutionBudget::standard(),
        target_frames: 12,
    }
}

// 04.T.15: 100 identical runs produce identical StateHash (Spec 04 Acceptance Criteria)
#[test]
fn test_04_t_15_one_hundred_identical_runs_produce_identical_hash() {
    let base_output = CombatSimulator::simulate(build_scenario_input());
    let expected_hash = base_output.final_state_hash;
    assert!(!expected_hash.is_empty(), "Hash must not be empty");

    for run_idx in 1..=100 {
        let output = CombatSimulator::simulate(build_scenario_input());
        assert_eq!(
            output.final_state_hash, expected_hash,
            "Run {} produced divergent state hash! Expected {}, got {}",
            run_idx, expected_hash, output.final_state_hash
        );
    }
}

// 04.T.16: Event log is byte-for-byte identical across runs
#[test]
fn test_04_t_16_event_log_determinism_across_runs() {
    let base_output = CombatSimulator::simulate(build_scenario_input());
    let base_events_json =
        serde_json::to_string(&base_output.events).expect("serialize base events");

    for run_idx in 1..=50 {
        let output = CombatSimulator::simulate(build_scenario_input());
        let events_json = serde_json::to_string(&output.events).expect("serialize events");
        assert_eq!(
            events_json, base_events_json,
            "Run {} produced divergent event log!",
            run_idx
        );
    }
}

// 04.T.17: ReplayRunner reproduces exact state hash and verification
#[test]
fn test_04_t_17_replay_runner_determinism() {
    let original = CombatSimulator::simulate(build_scenario_input());
    let replay_output = ReplayRunner::replay(build_scenario_input());

    assert_eq!(replay_output.status, original.status);
    assert_eq!(replay_output.total_frames, original.total_frames);
    assert_eq!(replay_output.final_state_hash, original.final_state_hash);
    assert_eq!(replay_output.events.len(), original.events.len());

    assert!(ReplayRunner::verify_replay(
        build_scenario_input,
        &original.final_state_hash
    ));
    assert!(!ReplayRunner::verify_replay(
        build_scenario_input,
        "invalid_corrupted_hash"
    ));
}
