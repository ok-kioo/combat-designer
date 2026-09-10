use combat_engine::simulation::engine::{SimulationOutput, SimulationStatus};
use combat_engine::simulation::events::{SimulationEvent, SimulationEventType};
use combat_engine::simulation::metrics::SimulationMetrics;
use combat_engine::simulation::snapshot::{ActorSnapshot, SimulationSnapshot};
use combat_engine::verification::*;
use proptest::prelude::*;
use serde_json::json;
use std::collections::BTreeMap;

proptest! {
    #[test]
    fn prop_evidence_sorting_determinism(
        damage1 in 0u64..1000u64,
        damage2 in 0u64..1000u64,
        frame1 in 0u32..100u32,
        frame2 in 0u32..100u32,
    ) {
        let ev1 = Evidence {
            evidence_id: "ev1".to_string(),
            kind: "kind1".to_string(),
            severity: "critical".to_string(),
            frame_start: frame1,
            frame_end: frame1 + 10,
            actor_ids: vec!["a1".to_string()],
            attack_ids: vec!["atk1".to_string()],
            event_ids: vec![1],
            state_fingerprints: vec![],
            simulation_state_hash: "hash1".to_string(),
            threshold: 100,
            observed: damage1,
            cycle_states: vec![],
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: damage1,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: vec![],
            details: "details1".to_string(),
        };

        let ev2 = Evidence {
            evidence_id: "ev2".to_string(),
            kind: "kind2".to_string(),
            severity: "warning".to_string(),
            frame_start: frame2,
            frame_end: frame2 + 10,
            actor_ids: vec!["a2".to_string()],
            attack_ids: vec!["atk2".to_string()],
            event_ids: vec![2],
            state_fingerprints: vec![],
            simulation_state_hash: "hash2".to_string(),
            threshold: 200,
            observed: damage2,
            cycle_states: vec![],
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: damage2,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: vec![],
            details: "details2".to_string(),
        };

        let mut order_a = vec![ev1.clone(), ev2.clone()];
        let mut order_b = vec![ev2, ev1];

        Evidence::sort_slice(&mut order_a);
        Evidence::sort_slice(&mut order_b);

        prop_assert_eq!(order_a, order_b);
    }

    #[test]
    fn prop_budget_tracker_monotonicity(steps in 1u32..500u32, limit in 10u32..100u32) {
        let budget = VerificationBudget {
            max_events_to_analyze: 1000,
            max_states_explored: 1000,
            max_cycles_checked: 1000,
            max_verification_steps: limit,
            max_evidence_items: 100,
        };

        let mut tracker = VerificationBudgetTracker::new(budget);
        let mut hit_exhaustion = false;

        for _ in 0..steps {
            if let Err(_) = tracker.track_step() {
                hit_exhaustion = true;
                break;
            }
        }

        let res = tracker.to_result();
        if steps > limit {
            prop_assert!(hit_exhaustion);
            prop_assert!(res.exhausted);
        } else {
            prop_assert_eq!(res.steps_taken, steps);
        }
    }

    #[test]
    fn prop_dps_integer_arithmetic_overflow_safety(
        damage in any::<u32>(),
        frame in 0u32..120u32,
    ) {
        let mut sim = SimulationOutput {
            status: SimulationStatus::Completed,
            total_frames: 120,
            events: vec![],
            final_state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
            metrics: SimulationMetrics::default(),
            snapshots: vec![],
        };

        let mut evt = SimulationEvent::new(frame, "fighter_1", SimulationEventType::HitConfirmed, 1);
        evt.damage = Some(damage);
        sim.events.push(evt);

        let mut tracker = VerificationBudgetTracker::new(VerificationBudget::default());
        let profile = VerificationProfile::strict();

        // Must never panic on arbitrary u32 damage inputs
        let (dps_check, burst_check) = rules::check_dps_and_burst("prop_test", &sim, &profile, &mut tracker);

        if damage as u64 > profile.max_burst_damage {
            prop_assert_eq!(burst_check.status, CheckStatus::Fail);
        }
        prop_assert!(dps_check.observed <= u64::MAX);
    }

    #[test]
    fn prop_deterministic_hash_under_repeated_runs(
        damage in 1u32..500u32,
        frames in 10u32..60u32,
    ) {
        let mut actors = BTreeMap::new();
        actors.insert(
            "p1".to_string(),
            ActorSnapshot {
                actor_id: "p1".to_string(),
                health: 1000,
                guard: 100,
                resources: BTreeMap::new(),
                combat_state: "neutral".to_string(),
                active_attack: None,
                frame_in_attack: None,
                is_blocking: false,
                is_airborne: false,
                stun_timer: 0,
                block_timer: 0,
            },
        );

        let mut snapshots = Vec::new();
        for f in 0..frames {
            snapshots.push(SimulationSnapshot {
                frame: f,
                actors: actors.clone(),
                state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
            });
        }

        let mut evt = SimulationEvent::new(1, "p1", SimulationEventType::HitConfirmed, 1);
        evt.damage = Some(damage);

        let sim = SimulationOutput {
            status: SimulationStatus::Completed,
            total_frames: frames,
            events: vec![evt],
            final_state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
            metrics: SimulationMetrics::default(),
            snapshots,
        };

        let req = VerificationRequest {
            workspace_id: "ws-prop".to_string(),
            project_revision: "rev-1".to_string(),
            canonical_snapshot_hash: "snap-1".to_string(),
            simulation_input_hash: "sim-1".to_string(),
            simulation_input: json!({"provenance": true}),
            verification_profile: VerificationProfile::fast(),
            verification_budget: VerificationBudget::default(),
            rule_set_version: "1.0.0".to_string(),
            verifier_version: "0.1.0".to_string(),
        };

        let res1 = MechanicalVerifier::verify(&req, &sim);
        let res2 = MechanicalVerifier::verify(&req, &sim);

        prop_assert_eq!(res1.gate_result_hash, res2.gate_result_hash);
        prop_assert_eq!(res1.verdict, res2.verdict);
    }
}
