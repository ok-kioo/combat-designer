import { describe, it, expect, vi } from "vitest";
import type {
  VerificationRequest,
  SimulationOutput,
} from "@combat-designer/backend";
import type { SimulationPort } from "../../../src/modules/combat/domain/repository/simulation-port.js";
import type {
  CombatAnalysisPort,
  CombatAnalysisResult,
} from "../../../src/modules/combat/domain/repository/combat-analysis-port.js";
import { analyzeCombatUseCase } from "../../../src/modules/combat/service/analyze-combat.js";

describe("Application Layer — CombatAnalysisPort & analyzeCombatUseCase", () => {
  const mockValidRequest: VerificationRequest = {
    workspace_id: "ws-test",
    project_id: "proj-1",
    project_revision: "rev-1",
    canonical_snapshot_hash: "snap-12345",
    simulation_input_hash: "sim-input-12345",
    simulation_input: {
      workspace_id: "ws-test",
      project_id: "proj-1",
      model_revision: "rev-1",
      scenario: {
        scenario_id: "scenario-1",
        actors: [
          {
            actor_id: "fighter_1",
            team: 1,
            initial_health: 1000,
            attack_ids: ["punch"],
          },
        ],
      },
      inputs: [],
      config: {
        tick_rate: 60,
        budget: {
          max_frames: 120,
          max_events: 50,
          max_state_transitions: 20,
          max_entities: 4,
        },
      },
    },
    verification_profile: {
      kind: "strict",
      max_sustained_dps: 150,
      max_burst_damage: 250,
      dps_window_frames: 60,
      max_juggle_frames: 90,
      min_reaction_window_frames: 4,
      min_counterplay_window_frames: 6,
      require_provenance: true,
      require_guard_integrity: true,
      require_cycle_analysis: true,
    },
    verification_budget: {
      max_events_to_analyze: 10000,
      max_states_explored: 10000,
      max_cycles_checked: 5000,
      max_verification_steps: 50000,
      max_evidence_items: 500,
    },
    rule_set_version: "1.0.0",
    verifier_version: "0.1.0",
  };

  const mockSimulationOutput: SimulationOutput = {
    status: "COMPLETED",
    total_frames: 60,
    events: [],
    final_state_hash: "a".repeat(64),
    metrics: {
      total_frames: 60,
      damage: 10,
      hits: 1,
      blocked_hits: 0,
      misses: 0,
      stun_frames: 0,
      recovery_frames: 10,
      resource_spent: 10,
      resource_remaining: 90,
      state_transitions: 2,
      cancel_count: 0,
      launch_count: 0,
      juggle_count: 0,
    },
  };

  const mockAnalysisResult: CombatAnalysisResult = {
    analysis_id: "an-001",
    workspace_id: "ws-test",
    project_revision: "rev-1",
    status: "COMPLETED",
    findings: [
      {
        id: "fnd-1",
        type: "info",
        severity: "low",
        title: "Nominal bounds",
        description: "Attack parameters comply with balance thresholds.",
        attack_ids: ["punch"],
      },
    ],
    recommendations: [
      {
        id: "rec-1",
        title: "Proceed",
        description: "Safe for testing",
        suggested_action: "Keep parameters",
        evidence_summary: "Nominal frames",
      },
    ],
    evidence_count: 1,
    analyzed_at: new Date().toISOString(),
  };

  it("orchestrates simulation and combat analysis successfully", async () => {
    const mockSimulationPort: SimulationPort = {
      simulate: vi.fn().mockResolvedValue(mockSimulationOutput),
    };
    const mockAnalysisPort: CombatAnalysisPort = {
      analyze: vi.fn().mockResolvedValue(mockAnalysisResult),
    };

    const result = await analyzeCombatUseCase(mockAnalysisPort, mockSimulationPort, mockValidRequest);

    expect(mockSimulationPort.simulate).toHaveBeenCalledTimes(1);
    expect(mockAnalysisPort.analyze).toHaveBeenCalledTimes(1);
    expect(mockAnalysisPort.analyze).toHaveBeenCalledWith(mockValidRequest, mockSimulationOutput);
    expect(result.status).toBe("COMPLETED");
    expect(result.analysis_id).toBe("an-001");
  });

  it("accepts precomputed simulation without re-running SimulationPort", async () => {
    const mockSimulationPort: SimulationPort = {
      simulate: vi.fn(),
    };
    const mockAnalysisPort: CombatAnalysisPort = {
      analyze: vi.fn().mockResolvedValue(mockAnalysisResult),
    };

    const result = await analyzeCombatUseCase(
      mockAnalysisPort,
      mockSimulationPort,
      mockValidRequest,
      mockSimulationOutput
    );

    expect(mockSimulationPort.simulate).not.toHaveBeenCalled();
    expect(mockAnalysisPort.analyze).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("COMPLETED");
  });

  it("fails closed when workspace_id is empty", async () => {
    const invalidRequest = { ...mockValidRequest, workspace_id: "" };
    const mockSimulationPort: SimulationPort = { simulate: vi.fn() };
    const mockAnalysisPort: CombatAnalysisPort = { analyze: vi.fn() };

    await expect(
      analyzeCombatUseCase(mockAnalysisPort, mockSimulationPort, invalidRequest)
    ).rejects.toThrow("workspace_id is strictly required");

    expect(mockSimulationPort.simulate).not.toHaveBeenCalled();
    expect(mockAnalysisPort.analyze).not.toHaveBeenCalled();
  });

  it("fails closed on cross-workspace mismatch between request and simulation input", async () => {
    const mismatchedRequest = {
      ...mockValidRequest,
      simulation_input: {
        ...mockValidRequest.simulation_input,
        workspace_id: "ws-different",
      },
    };
    const mockSimulationPort: SimulationPort = { simulate: vi.fn() };
    const mockAnalysisPort: CombatAnalysisPort = { analyze: vi.fn() };

    await expect(
      analyzeCombatUseCase(mockAnalysisPort, mockSimulationPort, mismatchedRequest)
    ).rejects.toThrow("workspace mismatch");

    expect(mockSimulationPort.simulate).not.toHaveBeenCalled();
    expect(mockAnalysisPort.analyze).not.toHaveBeenCalled();
  });

  it("fails closed when project_revision is missing", async () => {
    const invalidRequest = { ...mockValidRequest, project_revision: "" };
    const mockSimulationPort: SimulationPort = { simulate: vi.fn() };
    const mockAnalysisPort: CombatAnalysisPort = { analyze: vi.fn() };

    await expect(
      analyzeCombatUseCase(mockAnalysisPort, mockSimulationPort, invalidRequest)
    ).rejects.toThrow("project_revision is strictly required");
  });

  it("fails closed when canonical_snapshot_hash is missing", async () => {
    const invalidRequest = { ...mockValidRequest, canonical_snapshot_hash: "" };
    const mockSimulationPort: SimulationPort = { simulate: vi.fn() };
    const mockAnalysisPort: CombatAnalysisPort = { analyze: vi.fn() };

    await expect(
      analyzeCombatUseCase(mockAnalysisPort, mockSimulationPort, invalidRequest)
    ).rejects.toThrow("canonical_snapshot_hash is strictly required");
  });
});
