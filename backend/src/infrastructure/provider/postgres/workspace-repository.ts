import type { Workspace } from "../../../modules/workspace/domain/entity/workspace.js";
import type { WorkspaceRepositoryPort } from "../../../modules/workspace/domain/repository/workspace-repository-port.js";
import type { PostgresDatabase } from "./database.js";

export class PostgresWorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findById(workspaceId: string): Promise<Workspace | null> {
    const res = await this.db.query<Workspace>("SELECT * FROM workspaces WHERE id = $1", [workspaceId]);
    return res.rows[0] ?? null;
  }

  public async findByOwner(ownerUserId: string): Promise<Workspace[]> {
    const res = await this.db.query<Workspace>(
      "SELECT * FROM workspaces WHERE owner_user_id = $1 ORDER BY updated_at DESC",
      [ownerUserId]
    );
    return res.rows;
  }

  public async save(workspace: Workspace): Promise<void> {
    await this.db.query(
      `INSERT INTO workspaces (id, owner_user_id, name, description, engine, engine_version, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         owner_user_id = EXCLUDED.owner_user_id,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         engine = EXCLUDED.engine,
         engine_version = EXCLUDED.engine_version,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        workspace.id,
        workspace.owner_user_id,
        workspace.name,
        workspace.description ?? null,
        workspace.engine ?? null,
        workspace.engine_version ?? null,
        workspace.status,
        workspace.created_at,
        workspace.updated_at,
      ]
    );
  }

  public async delete(workspaceId: string): Promise<void> {
    await this.db.query("UPDATE workspaces SET status = 'archived', updated_at = $2 WHERE id = $1", [
      workspaceId,
      new Date().toISOString(),
    ]);
  }
}
