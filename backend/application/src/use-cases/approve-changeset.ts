import type {
  ChangeSetProposal,
  Principal,
  GateResult,
  SimulationOutput,
} from "@combat-designer/shared-contracts";
import { McpError } from "@combat-designer/shared-contracts";
import type { ChangeSetRepositoryPort } from "../ports/changeset-repository-port.js";

export interface ApproveChangesetInput {
  workspace_id: string;
  changeset_id: string;
  current_project_revision: string;
  gate_result: GateResult;
  simulation_output: SimulationOutput;
  decision: "approve" | "reject";
  rejection_reason?: string;
}

export async function approveChangesetUseCase(
  repo: ChangeSetRepositoryPort,
  principal: Principal,
  input: ApproveChangesetInput
): Promise<ChangeSetProposal> {
  // 1. Principal authentication and capability
  if (!principal || !principal.principal_id) {
    throw new McpError("UNAUTHENTICATED", "Caller principal is required for approval.");
  }

  // 2. Strict Human Requirement: Only human principals may approve changes
  if (principal.principal_type !== "human") {
    throw new McpError(
      "HUMAN_APPROVAL_REQUIRED",
      `Only human principals can approve changesets. Caller principal '${principal.principal_id}' has type '${principal.principal_type}'.`
    );
  }

  // 3. Capability check: changeset:approve
  if (!principal.capabilities.includes("changeset:approve") && !principal.capabilities.includes("admin:policy")) {
    throw new McpError(
      "UNAUTHORIZED",
      `Principal '${principal.principal_id}' lacks required capability 'changeset:approve'.`
    );
  }

  // 4. Workspace authorization
  if (!principal.authorized_workspaces.includes(input.workspace_id)) {
    throw new McpError(
      "UNAUTHORIZED",
      `Principal '${principal.principal_id}' is not authorized for workspace '${input.workspace_id}'.`
    );
  }

  // 5. ChangeSet existence and workspace match
  const changeset = await repo.getById(input.workspace_id, input.changeset_id);
  if (!changeset) {
    throw new McpError(
      "RESOURCE_NOT_FOUND",
      `ChangeSet '${input.changeset_id}' not found in workspace '${input.workspace_id}'.`
    );
  }

  // 6. Check state: cannot approve an already applied or withdrawn changeset
  if (changeset.status === "applied") {
    throw new McpError("INVALID_CHANGESET_STATE", "ChangeSet is already applied.");
  }
  if (changeset.status === "withdrawn" || changeset.status === "rejected") {
    throw new McpError("INVALID_CHANGESET_STATE", `Cannot approve changeset in '${changeset.status}' state.`);
  }

  // 7. Handle rejection
  if (input.decision === "reject") {
    changeset.status = "rejected";
    return await repo.update(changeset);
  }

  // 8. GateResult validation: Must be PASS
  if (!input.gate_result || input.gate_result.verdict !== "PASS") {
    throw new McpError(
      "MECHANICAL_GATE_FAILED",
      `Cannot approve ChangeSet without a valid PASS GateResult. Current verdict: '${input.gate_result?.verdict}'.`
    );
  }

  // 9. GateResult freshness & revision match
  if (input.gate_result.project_revision !== input.current_project_revision) {
    throw new McpError(
      "STALE_REVISION",
      `GateResult project revision '${input.gate_result.project_revision}' does not match current project revision '${input.current_project_revision}'.`
    );
  }
  if (changeset.base_revision !== input.current_project_revision) {
    throw new McpError(
      "STALE_REVISION",
      `ChangeSet base revision '${changeset.base_revision}' does not match current project revision '${input.current_project_revision}'.`
    );
  }

  // 10. Link Simulation and GateResult to ChangeSet
  changeset.status = "approved";
  changeset.approved_by = principal.principal_id;
  changeset.approved_at = new Date().toISOString();
  changeset.gate_run_id = input.gate_result.gate_run_id;
  changeset.gate_verdict = input.gate_result.verdict;
  changeset.simulation_hash = input.simulation_output.final_state_hash;

  return await repo.update(changeset);
}
