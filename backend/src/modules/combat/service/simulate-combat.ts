import type { SimulationInput, SimulationOutput } from "@combat-designer/backend";
import type { SimulationPort } from "../domain/repository/simulation-port.js";

/**
 * Application Use Case: Simulate Combat Scenario.
 *
 * Validates request boundaries (fail-closed on missing workspace or scenario)
 * and orchestrates execution via the SimulationPort.
 *
 * Architectural invariant: Application validates ("IS VALID?"),
 * while Simulator calculates ("WHAT HAPPENS?").
 */
export async function simulateCombatUseCase(
  port: SimulationPort,
  input: SimulationInput
): Promise<SimulationOutput> {
  if (!input.workspace_id || input.workspace_id.trim() === "") {
    throw new Error("Application validation error: workspace_id is strictly required for simulation.");
  }
  if (!input.project_id || input.project_id.trim() === "") {
    throw new Error("Application validation error: project_id is strictly required for simulation.");
  }
  if (!input.scenario || !input.scenario.actors || input.scenario.actors.length === 0) {
    throw new Error("Application validation error: scenario must contain at least one actor.");
  }
  if (!input.config || !input.config.budget) {
    throw new Error("Application validation error: execution budget is strictly required.");
  }

  return await port.simulate(input);
}
