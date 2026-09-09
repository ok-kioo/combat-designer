import type { ChangeSetProposal } from "@combat-designer/shared-contracts";

export interface ChangeSetRepositoryPort {
  save(proposal: ChangeSetProposal): Promise<ChangeSetProposal>;
  getById(workspaceId: string, changesetId: string): Promise<ChangeSetProposal | null>;
  getByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<ChangeSetProposal | null>;
  update(proposal: ChangeSetProposal): Promise<ChangeSetProposal>;
}
