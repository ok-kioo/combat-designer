import type { Workspace } from "../entity/workspace.js";

export interface WorkspaceRepositoryPort {
  findById(workspaceId: string): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  isPrincipalAuthorized(principalId: string, workspaceId: string): Promise<boolean>;
  listAuthorizedWorkspaces(principalId: string): Promise<string[]>;
}
