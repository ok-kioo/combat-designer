import type { WorkspaceRepositoryPort } from '../domain/repository/workspace-repository-port.js';
/** Rename is owner-only; a caller cannot transfer ownership through this command. */
export async function renameWorkspace(repo: WorkspaceRepositoryPort, userId: string, workspaceId: string, name: unknown) {
  const workspace = await repo.findById(workspaceId);
  if (!workspace || workspace.owner_user_id !== userId) return { status: 404, error: 'WORKSPACE_UNAVAILABLE' } as const;
  if (workspace.status === 'archived') return { status: 409, error: 'WORKSPACE_ARCHIVED' } as const;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) return { status: 400, error: 'INVALID_NAME' } as const;
  const updated = { ...workspace, name: name.trim(), updated_at: new Date().toISOString() };
  await repo.save(updated);
  return { status: 200, workspace: updated } as const;
}
