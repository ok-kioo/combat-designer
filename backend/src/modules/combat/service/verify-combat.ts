import type {
  VerificationRequest,
  GateResult,
  SimulationInput,
  SimulationOutput,
} from "@combat-designer/backend";
import type { SimulationPort } from "../domain/repository/simulation-port.js";
import type { MechanicalGatePort } from "../domain/repository/mechanical-gate-port.js";

/**
 * Application Use Case: Verify Combat Mechanics through the Mechanical Gate.
 *
 * Enforces:
 * 1. Request structural validation (fail-closed on missing workspace, project, or revision).
 * 2. Workspace isolation (cross-workspace simulation input rejection).
 * 3. Simulator execution via SimulationPort (or pre-computed SimulationOutput verification).
 * 4. Mechanical safety and validity proof via MechanicalGatePort.
 * 5. Returns GateResult without persistence, auto-mutations, or changeset approval.
 */
export async function verifyCombatUseCase(
  gatePort: MechanicalGatePort,
  simulationPort: SimulationPort,
  request: VerificationRequest,
  precomputedSimulation?: SimulationOutput
): Promise<GateResult> {
  // 1. Validate workspace_id
  if (!request.workspace_id || request.workspace_id.trim() === "") {
    throw new Error("Application validation error: workspace_id is strictly required for verification.");
  }

  // 2. Validate project_id and project_revision
  if (!request.project_id || request.project_id.trim() === "") {
    throw new Error("Application validation error: project_id is strictly required for verification.");
  }
  if (!request.project_revision || request.project_revision.trim() === "") {
    throw new Error("Application validation error: project_revision is strictly required for verification.");
  }

  // 3. Validate snapshot and input hashes
  if (!request.canonical_snapshot_hash || request.canonical_snapshot_hash.trim() === "") {
    throw new Error("Application validation error: canonical_snapshot_hash is strictly required.");
  }
  if (!request.simulation_input_hash || request.simulation_input_hash.trim() === "") {
    throw new Error("Application validation error: simulation_input_hash is strictly required.");
  }

  // 4. Validate rule_set_version and verifier_version
  if (!request.rule_set_version || request.rule_set_version.trim() === "") {
    throw new Error("Application validation error: rule_set_version is strictly required.");
  }
  if (!request.verifier_version || request.verifier_version.trim() === "") {
    throw new Error("Application validation error: verifier_version is strictly required.");
  }

  // 5. Cross-workspace validation if simulation_input declares workspace_id
  const simInputObj = request.simulation_input as unknown as SimulationInput;
  if (simInputObj?.workspace_id && simInputObj.workspace_id !== request.workspace_id) {
    throw new Error(
      `Application security error: workspace mismatch between request '${request.workspace_id}' and simulation_input '${simInputObj.workspace_id}'.`
    );
  }

  // 6. Obtain simulation output
  let simulation: SimulationOutput;
  if (precomputedSimulation) {
    simulation = precomputedSimulation;
  } else {
    if (!simInputObj || !simInputObj.scenario || !simInputObj.config) {
      throw new Error("Application validation error: simulation_input must contain valid scenario and config.");
    }
    simulation = await simulationPort.simulate(simInputObj);
  }

  // 7. Delegate mechanical evaluation to MechanicalGatePort
  return await gatePort.verify(request, simulation);
}
