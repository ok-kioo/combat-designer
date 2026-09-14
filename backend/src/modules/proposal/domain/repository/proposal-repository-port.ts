import type { Proposal } from "@combat-designer/backend";

export interface ProposalRepositoryPort {
  save(proposal: Proposal): Promise<Proposal>;
  getById(workspaceId: string, proposalId: string): Promise<Proposal | null>;
  getByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<Proposal | null>;
  update(proposal: Proposal): Promise<Proposal>;
}
