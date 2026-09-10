import type { Workspace } from "../../../modules/workspace/domain/entity/workspace.js";
import type { WorkspaceRepositoryPort } from "../../../modules/workspace/domain/repository/workspace-repository-port.js";
import { DEFAULT_DEV_USER_ID, DEFAULT_DEV_WORKSPACE_ID } from "../auth/in-memory-auth-repository.js";

export class InMemoryWorkspaceRepository implements WorkspaceRepositoryPort {
  private readonly workspaces = new Map<string, Workspace>();

  constructor(seedDevWorkspaces = true) {
    if (seedDevWorkspaces) {
      const now = new Date().toISOString();
      const defaultWs: Workspace = {
        id: DEFAULT_DEV_WORKSPACE_ID,
        owner_user_id: DEFAULT_DEV_USER_ID,
        name: "Default Combat Project",
        description: "Standard development workspace",
        engine: "unity",
        engine_version: "2022.3",
        status: "active",
        created_at: now,
        updated_at: now,
      };
      this.workspaces.set(defaultWs.id, defaultWs);

      // Seed common test workspaces with dev user ownership for seamless test runs
      for (const wsId of ["ws-test", "ws-tenant-a", "ws-tenant-b"]) {
        this.workspaces.set(wsId, {
          id: wsId,
          owner_user_id: DEFAULT_DEV_USER_ID,
          name: `Test Project ${wsId}`,
          description: "Automated test project",
          engine: "unity",
          engine_version: "2022.3",
          status: "active",
          created_at: now,
          updated_at: now,
        });
      }
    }
  }

  public async findById(workspaceId: string): Promise<Workspace | null> {
    const ws = this.workspaces.get(workspaceId);
    return ws ? { ...ws } : null;
  }

  public async findByOwner(ownerUserId: string): Promise<Workspace[]> {
    const results: Workspace[] = [];
    for (const ws of this.workspaces.values()) {
      if (ws.owner_user_id === ownerUserId) {
        results.push({ ...ws });
      }
    }
    return results;
  }

  public async save(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, { ...workspace });
  }

  public async delete(workspaceId: string): Promise<void> {
    this.workspaces.delete(workspaceId);
  }

  public clear(): void {
    this.workspaces.clear();
  }
}
