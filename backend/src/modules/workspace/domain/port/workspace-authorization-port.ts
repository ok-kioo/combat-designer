import type { Workspace } from "../entity/workspace.js";

export interface AuthorizationResult {
  authorized: boolean;
  status: 200 | 401 | 403 | 404;
  code: "OK" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";
  message: string;
  workspace?: Workspace;
}

/**
 * Application Layer Authorization Port for Workspace ownership verification.
 * Decouples HTTP and application callers from direct database queries.
 * Enforces: Workspace.owner_user_id === authenticated_user.id
 */
export interface WorkspaceAuthorizationPort {
  authorize(userId: string, workspaceId: string): Promise<AuthorizationResult>;
}
