import type { Workspace } from "../entity/workspace.js";

export interface WorkspaceRepositoryPort {
  findById(workspaceId: string): Promise<Workspace | null>;
  findByOwner(ownerUserId: string): Promise<Workspace[]>;
  save(workspace: Workspace): Promise<void>;
  delete?(workspaceId: string): Promise<void>;
}
