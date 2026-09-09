import type { ChangeSetProposal } from "@combat-designer/shared-contracts";
import { McpError } from "@combat-designer/shared-contracts";
import type { ChangeSetRepositoryPort } from "../ports/changeset-repository-port.js";

export async function getChangesetUseCase(
  repo: ChangeSetRepositoryPort,
  workspaceId: string,
  changesetId: string
): Promise<ChangeSetProposal | null> {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!changesetId || changesetId.trim() === "") {
    throw new McpError("INVALID_REQUEST", "changeset_id is strictly required.");
  }
  return await repo.getById(workspaceId, changesetId);
}
