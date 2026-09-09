import type { ChangeSetProposal } from "@combat-designer/shared-contracts";
import { McpError } from "@combat-designer/shared-contracts";
import type { ChangeSetRepositoryPort } from "../ports/changeset-repository-port.js";

export async function withdrawChangesetUseCase(
  repo: ChangeSetRepositoryPort,
  workspaceId: string,
  changesetId: string,
  reason: string
): Promise<ChangeSetProposal> {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!changesetId || changesetId.trim() === "") {
    throw new McpError("INVALID_REQUEST", "changeset_id is strictly required.");
  }

  const existing = await repo.getById(workspaceId, changesetId);
  if (!existing) {
    throw new McpError("RESOURCE_NOT_FOUND", `ChangeSet '${changesetId}' not found in workspace '${workspaceId}'.`);
  }

  if (existing.status === "applied") {
    throw new McpError("INVALID_CHANGESET_STATE", "Cannot withdraw a ChangeSet that has already been applied.");
  }

  existing.status = "withdrawn";
  return await repo.update(existing);
}
