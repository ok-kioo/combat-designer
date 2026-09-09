/**
 * SPEC 04 — Deterministic Simulator Boundary Contracts (TypeScript DTOs)
 *
 * CRITICAL ARCHITECTURAL RULE:
 * These types are boundary and serialization contracts between Application,
 * Gateway, and Simulator. They DO NOT duplicate gameplay mechanics.
 * Mechanical authority belongs exclusively to the Rust Engine.
 */

export interface ExecutionBudget {
  max_frames: number;
  max_events: number;
  max_state_transitions: number;
  max_entities: number;
}

export interface SimulationConfig {
  tick_rate: number;
  budget: ExecutionBudget;
  seed?: number;
}

export interface SimulationActorConfig {
  actor_id: string;
  team: number;
  initial_health: number;
  initial_guard?: number;
  initial_resources?: Record<string, number>;
  initial_state?: string;
  attack_ids: string[];
}

export interface SimulationScenario {
  scenario_id: string;
  actors: SimulationActorConfig[];
  environment?: Record<string, unknown>;
}

export interface ActorInputFrame {
  frame: number;
  actor_id: string;
  command: string;
  target_id?: string;
}

export interface SimulationInput {
  workspace_id: string;
  project_id: string;
  model_revision: string;
  scenario: SimulationScenario;
  inputs: ActorInputFrame[];
  config: SimulationConfig;
}

export type SimulationEventType =
  | "AttackStarted"
  | "HitboxActivated"
  | "HitDetected"
  | "HitConfirmed"
  | "BlockConfirmed"
  | "GuardBroken"
  | "HitstunApplied"
  | "BlockstunApplied"
  | "CancelOpened"
  | "CancelExecuted"
  | "ResourceSpent"
  | "StateChanged"
  | "AttackRecovered";

export interface SimulationEvent {
  frame: number;
  actor_id: string;
  event_type: SimulationEventType;
  sequence: number;
  attack_id?: string;
  target_id?: string;
  payload?: Record<string, unknown>;
}

export interface SimulationMetrics {
  total_frames: number;
  damage: number;
  hits: number;
  blocked_hits: number;
  misses: number;
  stun_frames: number;
  recovery_frames: number;
  resource_spent: number;
  resource_remaining: number;
  state_transitions: number;
  cancel_count: number;
  launch_count: number;
  juggle_count: number;
}

export interface SimulationSnapshot {
  frame: number;
  state_hash: string;
  actors: Record<string, unknown>;
}

export type SimulationStatus = "COMPLETED" | "BUDGET_EXCEEDED" | "ERROR";

export interface SimulationOutput {
  status: SimulationStatus;
  status_reason?: string;
  total_frames: number;
  events: SimulationEvent[];
  final_state_hash: string;
  metrics: SimulationMetrics;
  snapshots?: SimulationSnapshot[];
}
