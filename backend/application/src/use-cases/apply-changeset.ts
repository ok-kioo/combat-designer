import type {
  ChangeSetProposal,
  Principal,
  GateResult,
  SimulationOutput,
} from "@combat-designer/shared-contracts";
import { McpError } from "@combat-designer/shared-contracts";
import type { ChangeSetRepositoryPort } from "../ports/changeset-repository-port.js";

export interface ApplyChangesetInput {
  workspace_id: string;
  changeset_id: string;
  current_project_revision: string;
  canonical_snapshot_hash: string;
  simulation_input_hash: string;
  simulation_output: SimulationOutput;
  gate_result: GateResult;
  approver_principal?: Principal;
}

export async function applyChangesetUseCase(
  repo: ChangeSetRepositoryPort,
  principal: Principal,
  input: ApplyChangesetInput
): Promise<ChangeSetProposal> {
  // Precondition 1: Principal authenticated
  if (!principal || !principal.principal_id) {
    throw new McpError("UNAUTHENTICATED", "Caller principal is required to apply a changeset.");
  }

  // Precondition 2: Principal authorized for workspace
  if (!principal.authorized_workspaces.includes(input.workspace_id)) {
    throw new McpError(
      "UNAUTHORIZED",
      `Principal '${principal.principal_id}' is not authorized for workspace '${input.workspace_id}'.`
    );
  }

  // Precondition 3 & 4: Principal has changeset:apply capability and is permitted
  if (!principal.capabilities.includes("changeset:apply")) {
    throw new McpError(
      "UNAUTHORIZED",
      `Principal '${principal.principal_id}' lacks required capability 'changeset:apply'. Default for LLM is DENY.`
    );
  }

  // Precondition 5: ChangeSet exists
  const changeset = await repo.getById(input.workspace_id, input.changeset_id);
  if (!changeset) {
    throw new McpError(
      "RESOURCE_NOT_FOUND",
      `ChangeSet '${input.changeset_id}' not found in workspace '${input.workspace_id}'.`
    );
  }

  // Precondition 6: ChangeSet workspace matches
  if (changeset.workspace_id !== input.workspace_id) {
    throw new McpError(
      "WORKSPACE_MISMATCH",
      `ChangeSet workspace '${changeset.workspace_id}' does not match request workspace '${input.workspace_id}'.`
    );
  }

  // Precondition 21: ChangeSet has not already been applied (replay protection)
  if (changeset.applied_at || changeset.status === "applied") {
    throw new McpError("INVALID_CHANGESET_STATE", "Replay detected: ChangeSet has already been applied.");
  }

  // Precondition 7: ChangeSet status === approved
  if (changeset.status !== "approved") {
    throw new McpError(
      "APPROVAL_REQUIRED",
      `Cannot apply ChangeSet with status '${changeset.status}'. Only 'approved' ChangeSets can be applied.`
    );
  }

  // Precondition 8: approved_by exists
  if (!changeset.approved_by || changeset.approved_by.trim() === "") {
    throw new McpError("APPROVAL_REQUIRED", "ChangeSet lacks valid approved_by record.");
  }

  // Precondition 9: Approver principal_type === human
  if (input.approver_principal && input.approver_principal.principal_type !== "human") {
    throw new McpError(
      "HUMAN_APPROVAL_REQUIRED",
      `Approver must be of type 'human'. Got '${input.approver_principal.principal_type}'.`
    );
  }

  // Precondition 10: Current revision === ChangeSet base revision
  if (changeset.base_revision !== input.current_project_revision) {
    throw new McpError(
      "STALE_REVISION",
      `Revision race detected: ChangeSet base revision '${changeset.base_revision}' does not match current project revision '${input.current_project_revision}'.`
    );
  }

  // Precondition 11 & 12: SimulationResult exists and is valid
  if (!input.simulation_output || !input.simulation_output.final_state_hash) {
    throw new McpError("INVALID_SIMULATION_RESULT", "Valid SimulationOutput is required.");
  }

  // Precondition 13: GateResult exists
  if (!input.gate_result || !input.gate_result.gate_run_id) {
    throw new McpError("INVALID_GATE_RESULT", "Valid GateResult with gate_run_id is required.");
  }

  // Precondition 14: GateResult verdict === PASS
  if (input.gate_result.verdict !== "PASS") {
    throw new McpError(
      "MECHANICAL_GATE_FAILED",
      `Mechanical Gate verdict must be PASS to apply. Current verdict is '${input.gate_result.verdict}'.`
    );
  }

  // Precondition 15 & 17: GateResult is fresh and revision matches
  if (input.gate_result.project_revision !== input.current_project_revision) {
    throw new McpError(
      "STALE_REVISION",
      `Stale GateResult: gate project revision '${input.gate_result.project_revision}' does not match project revision '${input.current_project_revision}'.`
    );
  }

  // Precondition 16: GateResult workspace matches
  if (input.gate_result.workspace_id !== input.workspace_id) {
    throw new McpError(
      "WORKSPACE_MISMATCH",
      `GateResult workspace '${input.gate_result.workspace_id}' does not match request workspace '${input.workspace_id}'.`
    );
  }

  // Precondition 18: GateResult snapshot hash matches
  if (input.gate_result.canonical_snapshot_hash !== input.canonical_snapshot_hash) {
    throw new McpError(
      "STALE_REVISION",
      `GateResult snapshot hash mismatch: expected '${input.canonical_snapshot_hash}', got '${input.gate_result.canonical_snapshot_hash}'.`
    );
  }

  // Precondition 19: GateResult simulation input hash matches
  if (input.gate_result.simulation_input_hash !== input.simulation_input_hash) {
    throw new McpError(
      "INVALID_SIMULATION_RESULT",
      `Simulation input hash mismatch in GateResult.`
    );
  }

  // Precondition 20: GateResult belongs to this ChangeSet (simulation state hash link)
  if (changeset.simulation_hash && changeset.simulation_hash !== input.simulation_output.final_state_hash) {
    throw new McpError(
      "INVALID_SIMULATION_RESULT",
      `Simulation output hash does not match the approved ChangeSet simulation hash.`
    );
  }

  // All 21 preconditions verified -> Commit application
  changeset.status = "applied";
  changeset.applied_at = new Date().toISOString();

  return await repo.update(changeset);
}
