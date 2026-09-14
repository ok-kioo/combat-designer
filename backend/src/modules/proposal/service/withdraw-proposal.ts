import type { Proposal } from "@combat-designer/backend";
import { McpError } from "@combat-designer/backend";
import type { ProposalRepositoryPort } from "../domain/repository/proposal-repository-port.js";

export async function withdrawProposalUseCase(
  repo: ProposalRepositoryPort,
  workspaceId: string,
  proposalId: string,
  reason: string
): Promise<Proposal> {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!proposalId || proposalId.trim() === "") {
    throw new McpError("INVALID_REQUEST", "proposal_id is strictly required.");
  }

  const existing = await repo.getById(workspaceId, proposalId);
  if (!existing) {
    throw new McpError("RESOURCE_NOT_FOUND", `Proposal '${proposalId}' not found in workspace '${workspaceId}'.`);
  }

  if (existing.status !== "ACTIVE") {
    throw new McpError("INVALID_PROPOSAL_STATE", "Only active proposals can be withdrawn.");
  }

  existing.status = "WITHDRAWN";
  return await repo.update(existing);
}
