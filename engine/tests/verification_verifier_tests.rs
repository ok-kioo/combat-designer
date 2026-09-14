use combat_engine::simulation::engine::{SimulationOutput, SimulationStatus};
use combat_engine::simulation::events::{SimulationEvent, SimulationEventType};
use combat_engine::simulation::metrics::SimulationMetrics;
use combat_engine::simulation::snapshot::{ActorSnapshot, SimulationSnapshot};
use combat_engine::verification::*;
use serde_json::json;
use std::collections::BTreeMap;

fn make_base_snapshot(
    frame: u32,
    actor_id: &str,
    combat_state: &str,
    stun_timer: u32,
    is_airborne: bool,
) -> SimulationSnapshot {
    let mut actors = BTreeMap::new();
    let mut resources = BTreeMap::new();
    resources.insert("stamina".to_string(), 100);

    actors.insert(
        actor_id.to_string(),
        ActorSnapshot {
            actor_id: actor_id.to_string(),
            health: 1000,
            guard: 100,
            resources,
            combat_state: combat_state.to_string(),
            active_attack: None,
            frame_in_attack: None,
            is_blocking: false,
            is_airborne,
            stun_timer,
            block_timer: 0,
        },
    );

    SimulationSnapshot {
        frame,
        actors,
        state_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string(),
    }
}

fn make_valid_base_sim() -> SimulationOutput {
    let mut snapshots = Vec::new();
    for f in 0..60 {
        snapshots.push(make_base_snapshot(f, "fighter_1", "neutral", 0, false));
    }

    let metrics = SimulationMetrics {
        total_frames: 60,
        damage: 10,
        hits: 1,
        recovery_frames: 10,
        resource_spent: 20,
        ..SimulationMetrics::default()
    };

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

fn make_base_request(profile: VerificationProfile) -> VerificationRequest {
    VerificationRequest {
        workspace_id: "ws-test".to_string(),
        project_revision: "rev-001".to_string(),
        canonical_snapshot_hash: "snap-hash-001".to_string(),
        simulation_input_hash: "sim-hash-001".to_string(),
        simulation_input: json!({
            "scenario": {
                "scenario_id": "test_scenario",
                "provenance": { "engine": "unity", "source_path": "Assets/punch.asset" }
            }
        }),
        verification_profile: profile,
        verification_budget: VerificationBudget::default(),
        rule_set_version: "1.0.0".to_string(),
        verifier_version: "0.1.0".to_string(),
    }
}

#[test]
fn test_05_t_1_safe_attack_passes() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let result = CombatVerifier::verify(&req, &sim);
    assert_eq!(
        result.status,
        AnalysisStatus::Clear,
        "Summary: {:?}",
        result.checks
    );
    assert!(result.violations.is_empty());
    assert_eq!(result.analysis_hash.len(), 64);
}

#[test]
fn test_05_t_2_infinite_stun_loop_fails() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Create a loop of identical states with 0 stamina consumption and 0 reaction window
    for f in 0..100 {
        let mut snap = make_base_snapshot(f, "fighter_1", "hitstun", 10, false);
        if let Some(actor) = snap.actors.get_mut("fighter_1") {
            actor.resources.insert("stamina".to_string(), 100);
            actor.active_attack = Some("loop_atk".to_string());
        }
        sim.snapshots.push(snap);
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::InfiniteStunLoop));
}

#[test]
fn test_05_t_3_sustained_dps_above_limit_fails() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();

    // Generate 300 damage in 60 frames (exceeds strict profile limit of 150)
    for f in (0..60).step_by(5) {
        let mut evt = SimulationEvent::new(
            f,
            "fighter_1",
            SimulationEventType::HitConfirmed,
            (f + 1) as u64,
        );
        evt.damage = Some(30);
        sim.events.push(evt);
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::MaxSustainedDps));
}

#[test]
fn test_05_t_4_sustained_dps_below_limit_passes() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();

    // 50 damage in 60 frames (below limit of 150)
    for f in (0..60).step_by(15) {
        let mut evt = SimulationEvent::new(
            f,
            "fighter_1",
            SimulationEventType::HitConfirmed,
            (f + 1) as u64,
        );
        evt.damage = Some(10);
        sim.events.push(evt);
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    let dps_check = result
        .checks
        .iter()
        .find(|c| c.rule_id == "G05_MAX_SUSTAINED_DPS")
        .unwrap();
    assert_eq!(dps_check.status, CheckStatus::Pass);
}

#[test]
fn test_05_t_5_burst_above_limit_fails() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();

    // Consecutive combo hits totaling 350 damage within 30f (exceeds strict limit of 250)
    for f in 0..7 {
        let mut evt = SimulationEvent::new(
            f * 3,
            "fighter_1",
            SimulationEventType::HitConfirmed,
            (f + 1) as u64,
        );
        evt.damage = Some(50);
        sim.events.push(evt);
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::MaxBurst));
}

#[test]
fn test_05_t_6_burst_below_limit_passes() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();

    // Consecutive combo hits totaling 150 damage within 30f (below 250)
    for f in 0..3 {
        let mut evt = SimulationEvent::new(
            f * 3,
            "fighter_1",
            SimulationEventType::HitConfirmed,
            (f + 1) as u64,
        );
        evt.damage = Some(50);
        sim.events.push(evt);
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    let burst_check = result
        .checks
        .iter()
        .find(|c| c.rule_id == "G06_MAX_BURST")
        .unwrap();
    assert_eq!(burst_check.status, CheckStatus::Pass);
}

#[test]
fn test_05_t_7_zero_risk_proven_fails() {
    let mut sim = make_valid_base_sim();
    sim.metrics.damage = 100;
    sim.metrics.recovery_frames = 0;

    // Attacker is in invulnerable state while dealing damage
    for snap in &mut sim.snapshots {
        if let Some(actor) = snap.actors.get_mut("fighter_1") {
            actor.combat_state = "invulnerable".to_string();
            actor.active_attack = Some("god_punch".to_string());
        }
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::ZeroRiskAttack));
}

#[test]
fn test_05_t_8_zero_risk_unprovable_in_strict_blocks() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();
    sim.metrics.hits = 0;
    sim.metrics.damage = 0;

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    // In strict mode, zero-risk evaluation with no evidence is Inconclusive -> Blocked
    let zero_risk_check = result
        .checks
        .iter()
        .find(|c| c.rule_id == "G10_ZERO_RISK_ATTACK")
        .unwrap();
    assert_eq!(zero_risk_check.status, CheckStatus::Inconclusive);
    assert_eq!(result.status, AnalysisStatus::Blocked);
}

#[test]
fn test_05_t_9_counterplay_exists_passes() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Defender was hit, then recovers and has 10 actionable frames
    for f in 0..10 {
        sim.snapshots
            .push(make_base_snapshot(f, "defender", "hitstun", 10 - f, false));
    }
    for f in 10..30 {
        sim.snapshots
            .push(make_base_snapshot(f, "defender", "neutral", 0, false));
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    let cp_check = result
        .checks
        .iter()
        .find(|c| c.rule_id == "NO_COUNTERPLAY")
        .unwrap();
    assert_eq!(cp_check.status, CheckStatus::Pass);
}

#[test]
fn test_05_t_10_counterplay_absent_fails() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Defender stays in hitstun for all frames without recovering
    for f in 0..60 {
        sim.snapshots
            .push(make_base_snapshot(f, "defender", "hitstun", 10, false));
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::NoCounterplay));
}

#[test]
fn test_05_t_11_resource_loop_fails() {
    let mut sim = make_valid_base_sim();
    sim.events.clear();
    sim.metrics.resource_spent = 0;

    // 6 attacks executed with 0 resource consumption
    for f in 0..6 {
        sim.events.push(SimulationEvent::new(
            f * 10,
            "fighter_1",
            SimulationEventType::AttackStarted,
            (f + 1) as u64,
        ));
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::ResourceSafety));
}

#[test]
fn test_05_t_12_juggle_above_threshold_fails() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Actor is airborne for 100 consecutive frames (limit in strict is 90)
    for f in 0..100 {
        sim.snapshots
            .push(make_base_snapshot(f, "fighter_1", "airborne", 0, true));
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::MaxJuggle));
}

#[test]
fn test_05_t_13_juggle_below_threshold_passes() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Actor is airborne for 30 frames (below 90)
    for f in 0..30 {
        sim.snapshots
            .push(make_base_snapshot(f, "fighter_1", "airborne", 0, true));
    }
    for f in 30..60 {
        sim.snapshots
            .push(make_base_snapshot(f, "fighter_1", "neutral", 0, false));
    }

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    let juggle_check = result
        .checks
        .iter()
        .find(|c| c.rule_id == "G07_MAX_JUGGLE")
        .unwrap();
    assert_eq!(juggle_check.status, CheckStatus::Pass);
}

#[test]
fn test_05_t_14_invalid_cancel_fails() {
    let mut sim = make_valid_base_sim();
    // CancelExecuted without CancelOpened
    let cancel_evt = SimulationEvent::new(20, "fighter_1", SimulationEventType::CancelExecuted, 10);
    sim.events.push(cancel_evt);

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::CancelValidity));
}

#[test]
fn test_05_t_15_provenance_missing_in_strict_blocks() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request(VerificationProfile::strict());
    // Remove provenance from simulation_input
    req.simulation_input = json!({
        "scenario": {
            "scenario_id": "test_scenario"
        }
    });

    let result = CombatVerifier::verify(&req, &sim);
    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result
        .violations
        .contains(&ViolationCode::ProvenanceRequired));
}

#[test]
fn test_05_t_16_guard_integrity_violation_fails() {
    let mut sim = make_valid_base_sim();
    sim.snapshots.clear();

    // Defender trapped in blockstun for 20 frames then guard broken at frame 20
    for f in 0..20 {
        let mut snap = make_base_snapshot(f, "defender", "blockstun", 5, false);
        if let Some(actor) = snap.actors.get_mut("defender") {
            actor.is_blocking = true;
        }
        sim.snapshots.push(snap);
    }

    let gb_evt = SimulationEvent::new(20, "defender", SimulationEventType::GuardBroken, 15);
    sim.events.push(gb_evt);

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result.violations.contains(&ViolationCode::GuardIntegrity));
}

#[test]
fn test_05_t_17_verification_budget_exceeded() {
    let sim = make_valid_base_sim();
    let mut req = make_base_request(VerificationProfile::strict());
    // Set budget to extremely small limit
    req.verification_budget = VerificationBudget {
        max_events_to_analyze: 1,
        max_states_explored: 1,
        max_cycles_checked: 1,
        max_verification_steps: 1,
        max_evidence_items: 1,
    };

    let result = CombatVerifier::verify(&req, &sim);
    assert_eq!(result.status, AnalysisStatus::BudgetExceeded);
    assert!(result.violations.contains(&ViolationCode::ExecutionBudget));
}

#[test]
fn test_05_t_18_stale_snapshot_produces_stale_verdict() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: "rev-different".to_string(), // Mismatch!
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "strict".to_string(),
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: req.verifier_version.clone(),
    };

    let result = CombatVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.status, AnalysisStatus::Stale);
    assert!(result.violations.contains(&ViolationCode::StaleRevision));
}

#[test]
fn test_05_t_19_deterministic_repeated_verification_100_runs() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let first = CombatVerifier::verify(&req, &sim);
    for _ in 0..100 {
        let current = CombatVerifier::verify(&req, &sim);
        assert_eq!(first.status, current.status);
        assert_eq!(first.analysis_hash, current.analysis_hash);
        assert_eq!(first.violations, current.violations);
        assert_eq!(first.checks.len(), current.checks.len());
        assert_eq!(first.evidence.len(), current.evidence.len());
    }
}

#[test]
fn test_05_t_20_deterministic_analysis_hash() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let res1 = CombatVerifier::verify(&req, &sim);
    let res2 = CombatVerifier::verify(&req, &sim);

    assert_eq!(res1.analysis_hash, res2.analysis_hash);
    assert_eq!(res1.analysis_hash.len(), 64);
}

#[test]
fn test_05_t_21_replay_mismatch_detected_by_integrity() {
    let mut sim = make_valid_base_sim();
    // Corrupted state hash length
    sim.final_state_hash = "short_hash".to_string();

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::FindingsDetected);
    assert!(result
        .violations
        .contains(&ViolationCode::InvalidSimulation));
}

#[test]
fn test_05_t_22_revision_mismatch_produces_stale() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: "rev-old".to_string(),
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "strict".to_string(),
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: req.verifier_version.clone(),
    };

    let result = CombatVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.status, AnalysisStatus::Stale);
}

#[test]
fn test_05_t_23_profile_mismatch_produces_stale() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: req.project_revision.clone(),
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "fast".to_string(), // Mismatch!
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: req.verifier_version.clone(),
    };

    let result = CombatVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.status, AnalysisStatus::Stale);
}

#[test]
fn test_05_t_24_verifier_version_mismatch_produces_stale() {
    let sim = make_valid_base_sim();
    let req = make_base_request(VerificationProfile::strict());

    let baseline = FreshnessContext {
        workspace_id: req.workspace_id.clone(),
        project_revision: req.project_revision.clone(),
        canonical_snapshot_hash: req.canonical_snapshot_hash.clone(),
        simulation_input_hash: req.simulation_input_hash.clone(),
        verification_profile: "strict".to_string(),
        rule_set_version: req.rule_set_version.clone(),
        verifier_version: "0.0.1".to_string(), // Mismatch!
    };

    let result = CombatVerifier::verify_with_baseline(&req, &sim, &baseline);
    assert_eq!(result.status, AnalysisStatus::Stale);
}

#[test]
fn test_05_t_25_invalid_simulation_error_fails_closed() {
    let mut sim = make_valid_base_sim();
    sim.status = SimulationStatus::Error {
        message: "Internal simulator crash".to_string(),
    };

    let req = make_base_request(VerificationProfile::strict());
    let result = CombatVerifier::verify(&req, &sim);

    assert_eq!(result.status, AnalysisStatus::Error);
    assert!(result
        .violations
        .contains(&ViolationCode::InvalidSimulation));
}
