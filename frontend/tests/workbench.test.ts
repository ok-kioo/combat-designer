import { describe, it, expect, vi } from "vitest";
import { SimulationWorkbenchController } from "../features/simulation-workbench/components/SimulationWorkbench.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — Simulation and Gate Workbench UI (10.UI.4 - 10.UI.5)", () => {
  const workspaceId = "ws-workbench-alpha";

  it("10.UI.4: SimulationWorkbench runs deterministic simulation and displays event timeline", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.simulate = vi.fn().mockResolvedValue({
      workspace_id: workspaceId,
      simulation: {
        simulation_id: "sim_test_123",
        total_frames: 60,
        final_state_hash: "state_hash_abc_123",
        events: [
          { frame: 1, type: "attack_started", actor_id: "hero" },
          { frame: 4, type: "hitbox_active", actor_id: "hero" },
          { frame: 5, type: "hit_confirmed", actor_id: "dummy", details: { damage: 25 } },
        ],
        state_transitions: 2,
        status: "COMPLETED",
      },
    });

    const workbench = new SimulationWorkbenchController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const sim = await workbench.runSimulation({ budget: { max_frames: 60 } });
    expect(sim.simulation_id).toBe("sim_test_123");
    expect(mockApiClient.simulate).toHaveBeenCalled();

    const model = workbench.renderModel();
    expect(model.hasSimulation).toBe(true);
    expect(model.simulation?.eventsCount).toBe(3);
    expect(model.simulation?.finalHash).toBe("state_hash_abc_123");

    const html = workbench.renderHtml();
    expect(html).toContain("Frame 1");
    expect(html).toContain("hit_confirmed");
    expect(html).toContain("60 frames");
  });

  it("10.UI.5: SimulationWorkbench verifies Mechanical Gate and handles BUDGET_EXCEEDED verdict", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.simulate = vi.fn().mockResolvedValue({
      simulation: {
        simulation_id: "sim_budget",
        total_frames: 120,
        final_state_hash: "hash_budget",
        events: [],
        state_transitions: 0,
        status: "COMPLETED",
      },
    });

    mockApiClient.verify = vi.fn().mockResolvedValue({
      gate_result: {
        gate_run_id: "gate_run_budget_1",
        verdict: "BUDGET_EXCEEDED",
        violations: [],
        checks_count: 5,
        summary: { total_checks: 5, passed: 0, failed: 0, evidence_count: 0 },
        explanation: "The search space is too broad for the allocated execution budget.",
      },
    });

    const workbench = new SimulationWorkbenchController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const gate = await workbench.runVerification({ budgetExceeded: true });
    expect(gate.verdict).toBe("BUDGET_EXCEEDED");
    expect(gate.gate_run_id).toBe("gate_run_budget_1");

    const model = workbench.renderModel();
    expect(model.gateResult?.verdict).toBe("BUDGET_EXCEEDED");

    const html = workbench.renderHtml();
    expect(html).toContain("BUDGET_EXCEEDED");
  });
});
