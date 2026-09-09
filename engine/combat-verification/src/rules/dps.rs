//! Rules G05 & G06: Maximum Sustained DPS and Maximum Burst Damage Verification.
//!
//! Uses discrete integer arithmetic exclusively with overflow-safe checked math
//! and cross-multiplication. Never uses floating-point types.

use combat_simulation::engine::SimulationOutput;
use combat_simulation::events::SimulationEventType;

use crate::budget::VerificationBudgetTracker;
use crate::evidence::Evidence;
use crate::profile::VerificationProfile;
use crate::verdict::{CheckResult, CheckStatus};
use crate::violations::ViolationCode;

#[derive(Debug, Clone)]
struct DamageEvent {
    frame: u32,
    damage: u64,
    #[allow(dead_code)]
    attacker_id: String,
    #[allow(dead_code)]
    target_id: String,
    #[allow(dead_code)]
    attack_id: String,
}

pub fn check_dps_and_burst(
    scenario_id: &str,
    simulation: &SimulationOutput,
    profile: &VerificationProfile,
    tracker: &mut VerificationBudgetTracker,
) -> (CheckResult, CheckResult) {
    let _ = tracker.track_step();

    // 1. Collect all damage events
    let mut damage_events: Vec<DamageEvent> = Vec::new();
    for event in &simulation.events {
        let _ = tracker.track_step();

        if (event.event_type == SimulationEventType::HitConfirmed
            || event.event_type == SimulationEventType::HitDetected)
            || event.damage.is_some()
        {
            let dmg = event.damage.unwrap_or(0) as u64;
            if dmg > 0 {
                damage_events.push(DamageEvent {
                    frame: event.frame,
                    damage: dmg,
                    attacker_id: event.actor_id.clone(),
                    target_id: event.target_id.clone().unwrap_or_default(),
                    attack_id: event.attack_id.clone().unwrap_or_default(),
                });
            }
        }
    }

    // 2. Sliding window for sustained DPS
    let window_frames = profile.dps_window_frames.max(1);
    let mut max_observed_dps: u64 = 0;
    let mut worst_dps_window: Option<(u32, u32, u64)> = None;

    if !damage_events.is_empty() {
        let mut left_idx = 0;
        let mut current_window_damage: u64 = 0;

        for right_idx in 0..damage_events.len() {
            let _ = tracker.track_step();
            let right = &damage_events[right_idx];

            current_window_damage = current_window_damage.saturating_add(right.damage);

            // Evict events outside the window
            while left_idx < right_idx
                && damage_events[left_idx].frame.saturating_add(window_frames) <= right.frame
            {
                current_window_damage =
                    current_window_damage.saturating_sub(damage_events[left_idx].damage);
                left_idx += 1;
            }

            // DPS rate normalized to 60fps: (damage * 60) / window_frames
            let dps = current_window_damage
                .saturating_mul(60)
                .checked_div(window_frames as u64)
                .unwrap_or(0);

            if dps > max_observed_dps {
                max_observed_dps = dps;
                let start_f = damage_events[left_idx].frame;
                let end_f = right.frame;
                worst_dps_window = Some((start_f, end_f, dps));
            }
        }
    }

    // 3. Burst damage calculation (maximum continuous damage sequence)
    let mut max_observed_burst: u64 = 0;
    let mut current_combo_damage: u64 = 0;
    let mut combo_start_frame: u32 = 0;
    let mut last_hit_frame: u32 = 0;
    let mut worst_burst_span: Option<(u32, u32, u64)> = None;

    for dmg in &damage_events {
        let _ = tracker.track_step();

        if current_combo_damage == 0 {
            combo_start_frame = dmg.frame;
            current_combo_damage = dmg.damage;
        } else if dmg.frame.saturating_sub(last_hit_frame) <= 30 {
            // Contiguous combo hit within 30 frames
            current_combo_damage = current_combo_damage.saturating_add(dmg.damage);
        } else {
            if current_combo_damage > max_observed_burst {
                max_observed_burst = current_combo_damage;
                worst_burst_span = Some((combo_start_frame, last_hit_frame, current_combo_damage));
            }
            combo_start_frame = dmg.frame;
            current_combo_damage = dmg.damage;
        }
        last_hit_frame = dmg.frame;
    }

    if current_combo_damage > max_observed_burst {
        max_observed_burst = current_combo_damage;
        worst_burst_span = Some((combo_start_frame, last_hit_frame, current_combo_damage));
    }

    // Evaluate G05: Sustained DPS
    let dps_result = if max_observed_dps > profile.max_sustained_dps {
        let (f_start, f_end, observed_dps) =
            worst_dps_window.unwrap_or((0, window_frames, max_observed_dps));
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g05_dps_exceeded"),
            kind: "max_sustained_dps_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: f_start,
            frame_end: f_end,
            actor_ids: Vec::new(),
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: profile.max_sustained_dps,
            observed: observed_dps,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps,
            observed_burst: 0,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Observed sustained DPS of {} exceeds profile maximum limit of {} in window {}-{}f",
                observed_dps, profile.max_sustained_dps, f_start, f_end
            ),
        };

        CheckResult {
            rule_id: "G05_MAX_SUSTAINED_DPS".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: profile.max_sustained_dps,
            observed: observed_dps,
            expected: format!("Sustained DPS <= {}", profile.max_sustained_dps),
            violation_code: Some(ViolationCode::MaxSustainedDps),
            evidence: Some(evidence),
            message: format!(
                "Sustained DPS limit exceeded: observed {} > limit {}",
                observed_dps, profile.max_sustained_dps
            ),
        }
    } else {
        CheckResult {
            rule_id: "G05_MAX_SUSTAINED_DPS".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: profile.max_sustained_dps,
            observed: max_observed_dps,
            expected: format!("Sustained DPS <= {}", profile.max_sustained_dps),
            violation_code: None,
            evidence: None,
            message: "Sustained DPS within allowed limits".to_string(),
        }
    };

    // Evaluate G06: Burst Damage
    let burst_result = if max_observed_burst > profile.max_burst_damage {
        let (f_start, f_end, observed_burst) =
            worst_burst_span.unwrap_or((0, simulation.total_frames, max_observed_burst));
        let evidence = Evidence {
            evidence_id: format!("{scenario_id}_g06_burst_exceeded"),
            kind: "max_burst_violation".to_string(),
            severity: "critical".to_string(),
            frame_start: f_start,
            frame_end: f_end,
            actor_ids: Vec::new(),
            attack_ids: Vec::new(),
            event_ids: Vec::new(),
            state_fingerprints: Vec::new(),
            simulation_state_hash: simulation.final_state_hash.clone(),
            threshold: profile.max_burst_damage,
            observed: observed_burst,
            cycle_states: Vec::new(),
            stamina_cost_net: 0,
            observed_reaction_window_frames: 0,
            observed_dps: 0,
            observed_burst,
            observed_juggle_frames: 0,
            guard_break_escape_options: 0,
            missing_provenance_fields: Vec::new(),
            details: format!(
                "Observed sequence burst damage of {} exceeds profile maximum limit of {} in frames {}-{}f",
                observed_burst, profile.max_burst_damage, f_start, f_end
            ),
        };

        CheckResult {
            rule_id: "G06_MAX_BURST".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Fail,
            threshold: profile.max_burst_damage,
            observed: observed_burst,
            expected: format!("Burst damage <= {}", profile.max_burst_damage),
            violation_code: Some(ViolationCode::MaxBurst),
            evidence: Some(evidence),
            message: format!(
                "Sequence burst damage exceeded: observed {} > limit {}",
                observed_burst, profile.max_burst_damage
            ),
        }
    } else {
        CheckResult {
            rule_id: "G06_MAX_BURST".to_string(),
            scenario_id: scenario_id.to_string(),
            status: CheckStatus::Pass,
            threshold: profile.max_burst_damage,
            observed: max_observed_burst,
            expected: format!("Burst damage <= {}", profile.max_burst_damage),
            violation_code: None,
            evidence: None,
            message: "Burst damage within allowed limits".to_string(),
        }
    };

    (dps_result, burst_result)
}
