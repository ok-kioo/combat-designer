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

fn sample_attack(id_str: &str) -> Attack {
    let id: AttackId = id_str.parse().expect("valid attack id");
    let name = SanitizedName::from_raw(id_str).expect("valid name");
    let prov = valid_provenance();

    let hitbox = Hitbox::new(
        format!("{}_hb", id_str.replace(':', "_")),
        id.clone(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(1, 3).expect("valid window"),
        1000,
        10,
        0,
        false,
    );

    AttackBuilder::new(id, name, 1, 2, 2, 20, prov)
        .add_hitbox(hitbox)
        .build()
        .expect("valid attack")
}

// 04.T.13: Max frames exceeded produces explicit BUDGET_EXCEEDED (never PASS or unhandled ERROR)
#[test]
fn test_04_t_13_max_frames_budget_exceeded() {
    let attack_id = "unity:proj:slash";
    let attack = sample_attack(attack_id);

    let mut actors = BTreeMap::new();
    actors.insert(
        "p1".to_string(),
        ActorState::new("p1", 1, 100, vec![attack_id.to_string()]),
    );

    let mut attacks = BTreeMap::new();
    attacks.insert(attack_id.to_string(), attack);

    let budget = ExecutionBudget {
        max_frames: 5, // Budget limit = 5 frames
        max_events: 10_000,
        max_state_transitions: 5_000,
        max_entities: 32,
    };

    let input = SimulationInput {
        actors,
        attacks,
        inputs: Vec::new(),
        budget,
        target_frames: 20, // Request 20 frames
    };

    let output = CombatSimulator::simulate(input);

    match output.status {
        SimulationStatus::BudgetExceeded { ref reason } => {
            assert!(
                reason.contains("frame") || reason.contains("limit"),
                "Reason must mention frame limit exhaustion: {}",
                reason
            );
        }
        other => panic!("Expected BudgetExceeded, got {:?}", other),
    }

    // Must not exceed max_frames
    assert!(output.total_frames <= 5);
}

// 04.T.14: Max events, transitions, and entities exceeded produce specific BUDGET_EXCEEDED
#[test]
fn test_04_t_14_max_events_and_transitions_exceeded() {
    let attack_id = "unity:proj:slash";
    let attack = sample_attack(attack_id);

    // Sub-case A: Max events exceeded
    {
        let mut actors = BTreeMap::new();
        actors.insert(
            "p1".to_string(),
            ActorState::new("p1", 1, 100, vec![attack_id.to_string()]),
        );
        let mut attacks = BTreeMap::new();
        attacks.insert(attack_id.to_string(), attack.clone());

        let budget = ExecutionBudget {
            max_frames: 100,
            max_events: 2, // Only allow 2 events
            max_state_transitions: 1000,
            max_entities: 32,
        };

        let inputs = vec![ActorCommand {
            frame: 0,
            actor_id: "p1".to_string(),
            command: attack_id.to_string(),
            target_id: None,
        }];

        let input = SimulationInput {
            actors,
            attacks,
            inputs,
            budget,
            target_frames: 10,
        };

        let output = CombatSimulator::simulate(input);
        match output.status {
            SimulationStatus::BudgetExceeded { ref reason } => {
                assert!(
                    reason.contains("events"),
                    "Expected events limit in reason: {}",
                    reason
                );
            }
            other => panic!("Expected BudgetExceeded for events, got {:?}", other),
        }
    }

    // Sub-case B: Max state transitions exceeded
    {
        let mut actors = BTreeMap::new();
        actors.insert(
            "p1".to_string(),
            ActorState::new("p1", 1, 100, vec![attack_id.to_string()]),
        );
        let mut attacks = BTreeMap::new();
        attacks.insert(attack_id.to_string(), attack.clone());

        let budget = ExecutionBudget {
            max_frames: 100,
            max_events: 1000,
            max_state_transitions: 1, // Only allow 1 transition
            max_entities: 32,
        };

        let inputs = vec![ActorCommand {
            frame: 0,
            actor_id: "p1".to_string(),
            command: attack_id.to_string(),
            target_id: None,
        }];

        let input = SimulationInput {
            actors,
            attacks,
            inputs,
            budget,
            target_frames: 10,
        };

        let output = CombatSimulator::simulate(input);
        match output.status {
            SimulationStatus::BudgetExceeded { ref reason } => {
                assert!(
                    reason.contains("transition"),
                    "Expected transition limit in reason: {}",
                    reason
                );
            }
            other => panic!("Expected BudgetExceeded for transitions, got {:?}", other),
        }
    }

    // Sub-case C: Max entities exceeded (evaluated at initialization)
    {
        let mut actors = BTreeMap::new();
        for i in 0..5 {
            let name = format!("entity_{}", i);
            actors.insert(name.clone(), ActorState::new(name, 1, 100, vec![]));
        }

        let budget = ExecutionBudget {
            max_frames: 100,
            max_events: 1000,
            max_state_transitions: 1000,
            max_entities: 3, // Only allow 3 entities, but 5 provided
        };

        let input = SimulationInput {
            actors,
            attacks: BTreeMap::new(),
            inputs: Vec::new(),
            budget,
            target_frames: 10,
        };

        let output = CombatSimulator::simulate(input);
        match output.status {
            SimulationStatus::BudgetExceeded { ref reason } => {
                assert!(
                    reason.contains("entities"),
                    "Expected entity limit in reason: {}",
                    reason
                );
            }
            other => panic!("Expected BudgetExceeded for entities, got {:?}", other),
        }
    }
}
