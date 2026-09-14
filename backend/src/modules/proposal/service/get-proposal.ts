import type { Proposal } from "@combat-designer/backend";
import { McpError } from "@combat-designer/backend";
import type { ProposalRepositoryPort } from "../domain/repository/proposal-repository-port.js";

export async function getProposalUseCase(
  repo: ProposalRepositoryPort,
  workspaceId: string,
  proposalId: string
): Promise<Proposal | null> {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!proposalId || proposalId.trim() === "") {
    throw new McpError("INVALID_REQUEST", "proposal_id is strictly required.");
  }
  return await repo.getById(workspaceId, proposalId);
}
