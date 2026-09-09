use combat_simulation::engine::{SimulationOutput, SimulationStatus};
use combat_simulation::events::{SimulationEvent, SimulationEventType};
use combat_simulation::metrics::SimulationMetrics;
use combat_simulation::snapshot::{ActorSnapshot, SimulationSnapshot};
use combat_verification::*;
use serde_json::json;
use std::collections::BTreeMap;

fn make_valid_base_sim() -> SimulationOutput {
    let mut snapshots = Vec::new();
    let mut actors = BTreeMap::new();
    let mut resources = BTreeMap::new();
    resources.insert("stamina".to_string(), 100);

    actors.insert(
        "fighter_1".to_string(),
        ActorSnapshot {
            actor_id: "fighter_1".to_string(),
            health: 1000,
            guard: 100,
            resources,
            combat_state: "neutral".to_string(),
            active_attack: None,
            frame_in_attack: None,
            is_blocking: false,
            is_airborne: false,
            stun_timer: 0,
            block_timer: 0,
        },
    );

    for f in 0..60 {
        snapshots.push(SimulationSnapshot {
            frame: f,
            actors: actors.clone(),
            state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
                .to_string(),
        });
    }

    let mut metrics = SimulationMetrics::default();
    metrics.total_frames = 60;
    metrics.damage = 10;
    metrics.hits = 1;
    metrics.recovery_frames = 10;
    metrics.resource_spent = 20;

    let mut event1 = SimulationEvent::new(10, "fighter_1", SimulationEventType::AttackStarted, 1);
    event1.attack_id = Some("slash".to_string());

    let mut event2 = SimulationEvent::new(12, "fighter_1", SimulationEventType::ResourceSpent, 2);
    event2.attack_id = Some("slash".to_string());

    let mut event3 = SimulationEvent::new(15, "fighter_1", SimulationEventType::HitConfirmed, 3);
    event3.attack_id = Some("slash".to_string());
    event3.target_id = Some("dummy".to_string());
    event3.damage = Some(10);

    SimulationOutput {
        status: SimulationStatus::Completed,
        total_frames: 60,
        events: vec![event1, event2, event3],
        final_state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            .to_string(),
        metrics,
        snapshots,
    }
}

fn make_base_request() -> VerificationRequest {
    VerificationRequest {
        workspace_id: "ws-auth".to_string(),
        project_revision: "rev-001".to_string(),
        canonical_snapshot_hash: "snap-hash-001".to_string(),
        simulation_input_hash: "sim-hash-001".to_string(),
        simulation_input: json!({
            "scenario": {
                "scenario_id": "test_scenario",
                "provenance": { "engine": "unity", "source_path": "Assets/punch.asset" }
            }
        }),
        verification_profile: VerificationProfile::strict(),
        verification_budget: VerificationBudget::default(),
        rule_set_version: "1.0.0".to_string(),
        verifier_version: "0.1.0".to_string(),
    }
}

#[test]
fn test_05_sec_1_workspace_isolation() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request();
    req.workspace_id = "   ".to_string(); // Empty/whitespace workspace

    let result = MechanicalVerifier::verify(&req, &sim);
    assert_eq!(result.verdict, GateVerdict::Error);
    assert!(result
        .violations
        .contains(&ViolationCode::InvalidSimulation));
}

#[test]
fn test_05_sec_2_stale_gate_result() {
    let sim = make_valid_base_sim();
    let req = make_base_request();

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: "rev-different".to_string(),
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "strict".to_string(),
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: req.verifier_version.clone(),
    };

    let result = MechanicalVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.verdict, GateVerdict::Stale);
    assert!(result.violations.contains(&ViolationCode::StaleRevision));
}

#[test]
fn test_05_sec_3_inconsistent_forged_content_hash() {
    let sim = make_valid_base_sim();
    let req = make_base_request();

    let result1 = MechanicalVerifier::verify(&req, &sim);

    // Tamper with check message or threshold
    let mut tampered_checks = result1.checks.clone();
    tampered_checks[0].threshold += 1;

    let profile_str = "strict";
    let budget_res = result1.budgets.clone();
    let forged_hash = compute_gate_result_hash(
        &req.workspace_id,
        &req.project_revision,
        &req.canonical_snapshot_hash,
        &req.simulation_input_hash,
        &sim.final_state_hash,
        &result1.event_log_hash,
        profile_str,
        &req.rule_set_version,
        &req.verifier_version,
        &result1.verdict,
        &tampered_checks,
        &result1.violations,
        &result1.evidence,
        &budget_res,
    );

    assert_ne!(result1.gate_result_hash, forged_hash);
}

#[test]
fn test_05_sec_4_modified_simulation_result_detected() {
    let mut sim = make_valid_base_sim();
    // Non-monotonic event sequence tampering
    sim.events[1].sequence = 99;
    sim.events[2].sequence = 1;

    let req = make_base_request();
    let result = MechanicalVerifier::verify(&req, &sim);

    assert_eq!(result.verdict, GateVerdict::Fail);
    assert!(result
        .violations
        .contains(&ViolationCode::InvalidSimulation));
}

#[test]
fn test_05_sec_5_budget_bypass_prevention() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request();
    req.verification_budget.max_events_to_analyze = 0; // 0 event budget

    let result = MechanicalVerifier::verify(&req, &sim);
    assert_eq!(result.verdict, GateVerdict::BudgetExceeded);
    assert!(result.violations.contains(&ViolationCode::ExecutionBudget));
}

#[test]
fn test_05_sec_6_malformed_verification_request() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request();
    req.workspace_id = "".to_string();

    let result = MechanicalVerifier::verify(&req, &sim);
    assert_eq!(result.verdict, GateVerdict::Error);
}

#[test]
fn test_05_sec_7_non_deterministic_evidence_ordering_prevented() {
    let sim = make_valid_base_sim();
    let req = make_base_request();

    let first = MechanicalVerifier::verify(&req, &sim);
    for _ in 0..100 {
        let current = MechanicalVerifier::verify(&req, &sim);
        assert_eq!(first.evidence, current.evidence);
    }
}

#[test]
fn test_05_sec_8_invalid_profile_escalation_rejection() {
    let profile = VerificationProfile::research();
    // Research profile cannot authorize production release
    assert!(!profile.can_authorize_release());
    assert!(!profile.is_fail_closed());

    let strict = VerificationProfile::strict();
    assert!(strict.can_authorize_release());
    assert!(strict.is_fail_closed());
}

#[test]
fn test_05_sec_9_replay_mismatch() {
    let mut sim = make_valid_base_sim();
    sim.final_state_hash = "".to_string();

    let req = make_base_request();
    let result = MechanicalVerifier::verify(&req, &sim);

    assert_eq!(result.verdict, GateVerdict::Fail);
    assert!(result
        .violations
        .contains(&ViolationCode::InvalidSimulation));
}

#[test]
fn test_05_sec_10_revision_race_detection() {
    let sim = make_valid_base_sim();
    let req = make_base_request();

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: "rev-new-concurrent".to_string(),
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "strict".to_string(),
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: req.verifier_version.clone(),
    };

    let result = MechanicalVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.verdict, GateVerdict::Stale);
}

#[test]
fn test_05_sec_11_integer_overflow_safety() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();

    // Damage event with maximum u32 value to test overflow safety
    let mut evt = SimulationEvent::new(10, "fighter_1", SimulationEventType::HitConfirmed, 1);
    evt.damage = Some(u32::MAX);
    sim.events.push(evt);

    let req = make_base_request();
    let result = MechanicalVerifier::verify(&req, &sim);

    // Should fail cleanly due to DPS exceeding limit, without crashing or silent overflow to PASS
    assert_eq!(result.verdict, GateVerdict::Fail);
    assert!(result.violations.contains(&ViolationCode::MaxSustainedDps));
}

#[test]
fn test_05_sec_12_missing_provenance_in_strict_fails_closed() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request();
    req.simulation_input = json!({}); // Empty provenance in strict

    let result = MechanicalVerifier::verify(&req, &sim);
    assert_eq!(result.verdict, GateVerdict::Fail);
    assert!(result
        .violations
        .contains(&ViolationCode::ProvenanceRequired));
}
