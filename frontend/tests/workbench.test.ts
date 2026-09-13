import { describe, it, expect, vi } from "vitest";
import { SimulationWorkbenchController } from "../features/simulation-workbench/components/SimulationWorkbench.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — Simulation and Mechanical Validation Workbench UI (10.UI.4 - 10.UI.5)", () => {
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

  it("10.UI.5: SimulationWorkbench analyzes combat mechanics and displays diagnostics", async () => {
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

    mockApiClient.analyzeCombat = vi.fn().mockResolvedValue({
      id: "an_bench_1",
      status: "COMPLETED",
      findings: [
        {
          id: "fnd_1",
          type: "EXCESSIVE_DAMAGE",
          severity: "medium",
          title: "High damage on normal attack",
          description: "Damage exceeds normal threshold.",
        },
      ],
    });

    const workbench = new SimulationWorkbenchController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const analysis = await workbench.runAnalysis({ subject: "Benchmark test" });
    expect(analysis.status).toBe("COMPLETED");
    expect(analysis.analysis_id).toBe("an_bench_1");

    const model = workbench.renderModel();
    expect(model.hasAnalysisResult).toBe(true);
    expect(model.analysisResult?.status).toBe("COMPLETED");
    expect(model.analysisResult?.analysisId).toBe("an_bench_1");

    const html = workbench.renderHtml();
    expect(html).toContain("COMPLETED");
    expect(html).toContain("an_bench_1");
  });
});
