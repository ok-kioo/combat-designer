import type { ChangeSetProposal, ChangeSetMutation } from "@combat-designer/backend";
import { McpError } from "@combat-designer/backend";
import type { ChangeSetRepositoryPort } from "../domain/repository/changeset-repository-port.js";
import crypto from "node:crypto";

export interface ProposeChangesetInput {
  workspace_id: string;
  base_revision: string;
  target_revision: string;
  proposed_by: string;
  mutations: ChangeSetMutation[];
  idempotency_key?: string;
}

export async function proposeChangesetUseCase(
  repo: ChangeSetRepositoryPort,
  input: ProposeChangesetInput
): Promise<ChangeSetProposal> {
  if (!input.workspace_id || input.workspace_id.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!input.base_revision || input.base_revision.trim() === "") {
    throw new McpError("INVALID_REQUEST", "base_revision is strictly required.");
  }
  if (!input.target_revision || input.target_revision.trim() === "") {
    throw new McpError("INVALID_REQUEST", "target_revision is strictly required.");
  }
  if (!input.proposed_by || input.proposed_by.trim() === "") {
    throw new McpError("UNAUTHENTICATED", "proposed_by principal is strictly required.");
  }
  if (!input.mutations || input.mutations.length === 0) {
    throw new McpError("INVALID_REQUEST", "mutations list must contain at least one valid mutation.");
  }

  // Idempotency check
  if (input.idempotency_key && input.idempotency_key.trim() !== "") {
    const existing = await repo.getByIdempotencyKey(input.workspace_id, input.idempotency_key);
    if (existing) {
      return existing;
    }
  }

  const proposal: ChangeSetProposal = {
    changeset_id: `cs_${crypto.randomUUID().slice(0, 12)}`,
    workspace_id: input.workspace_id,
    base_revision: input.base_revision,
    target_revision: input.target_revision,
    proposed_by: input.proposed_by,
    status: "proposed",
    mutations: input.mutations,
    created_at: new Date().toISOString(),
    idempotency_key: input.idempotency_key,
  };

  return await repo.save(proposal);
}
