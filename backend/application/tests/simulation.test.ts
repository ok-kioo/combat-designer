import { describe, it, expect, vi } from "vitest";
import type { SimulationInput, SimulationOutput } from "@combat-designer/shared-contracts";
import type { SimulationPort } from "../src/ports/simulation-port.js";
import { simulateCombatUseCase } from "../src/use-cases/simulate-combat.js";

describe("Application Layer — SimulationPort & Use Case Validation", () => {
  const mockValidInput: SimulationInput = {
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
          attack_ids: ["unity:proj-1:punch"],
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
  };

  it("application validates request and delegates to SimulationPort", async () => {
    const mockOutput: SimulationOutput = {
      status: "COMPLETED",
      total_frames: 60,
      events: [],
      final_state_hash: "hash-12345",
      metrics: {
        total_frames: 60,
        damage: 0,
        hits: 0,
        blocked_hits: 0,
        misses: 0,
        stun_frames: 0,
        recovery_frames: 0,
        resource_spent: 0,
        resource_remaining: 100,
        state_transitions: 0,
        cancel_count: 0,
        launch_count: 0,
        juggle_count: 0,
      },
    };

    const mockPort: SimulationPort = {
      simulate: vi.fn().mockResolvedValue(mockOutput),
    };

    const result = await simulateCombatUseCase(mockPort, mockValidInput);
    expect(mockPort.simulate).toHaveBeenCalledTimes(1);
    expect(mockPort.simulate).toHaveBeenCalledWith(mockValidInput);
    expect(result.status).toBe("COMPLETED");
    expect(result.final_state_hash).toBe("hash-12345");
  });

  it("fails closed when workspace_id is empty", async () => {
    const invalidInput = { ...mockValidInput, workspace_id: "" };
    const mockPort: SimulationPort = { simulate: vi.fn() };

    await expect(simulateCombatUseCase(mockPort, invalidInput)).rejects.toThrow(
      "workspace_id is strictly required"
    );
    expect(mockPort.simulate).not.toHaveBeenCalled();
  });

  it("fails closed when scenario actors are empty", async () => {
    const invalidInput = {
      ...mockValidInput,
      scenario: { scenario_id: "s1", actors: [] },
    };
    const mockPort: SimulationPort = { simulate: vi.fn() };

    await expect(simulateCombatUseCase(mockPort, invalidInput)).rejects.toThrow(
      "scenario must contain at least one actor"
    );
    expect(mockPort.simulate).not.toHaveBeenCalled();
  });
});
