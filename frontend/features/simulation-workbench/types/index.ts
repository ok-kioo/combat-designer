export interface ActorConfig {
  actor_id: string;
  team: number;
  initial_health: number;
  attack_ids: string[];
}

export interface SimulationScenarioConfig {
  scenario_id: string;
  actors: ActorConfig[];
  budget: {
    max_frames: number;
    max_iterations?: number;
  };
  tick_rate?: number;
}

export interface SimulationTimelineEvent {
  frame: number;
  type: string;
  actor_id?: string;
  details?: Record<string, unknown>;
}

export interface GateViolation {
  rule_id: string;
  severity: "FAIL" | "BLOCK" | "WARN";
  message: string;
}

export interface WorkbenchState {
  workspaceId: string;
  scenario: SimulationScenarioConfig;
  isRunning: boolean;
  simulationResult?: {
    simulation_id: string;
    total_frames: number;
    final_state_hash: string;
    events: SimulationTimelineEvent[];
    state_transitions: number;
    status: string;
  };
  gateResult?: {
    gate_run_id: string;
    verdict: "PASS" | "FAIL" | "BLOCKED" | "STALE" | "BUDGET_EXCEEDED";
    violations: GateViolation[];
    checks_count: number;
    explanation?: string;
  };
  error?: string;
}
