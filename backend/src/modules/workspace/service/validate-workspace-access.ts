import { McpError } from "../../mcp/domain/entity/errors.js";
import type { Principal } from "../../mcp/domain/entity/auth.js";

export function validateWorkspaceAccess(
  principal: Principal,
  targetWorkspaceId: string
): void {
  if (!targetWorkspaceId || targetWorkspaceId.trim().length === 0) {
    throw new McpError("WORKSPACE_REQUIRED", "Target workspace_id must not be empty");
  }

  // System principals can access all workspaces
  if (principal.principal_type === "system" || principal.capabilities.includes("combat:admin" as any)) {
    return;
  }

  const isAuthorized =
    principal.authorized_workspaces.includes(targetWorkspaceId) ||
    principal.authorized_workspaces.includes("*");
  if (!isAuthorized) {
    throw new McpError(
      "WORKSPACE_MISMATCH",
      `Principal '${principal.principal_id}' is not authorized to access workspace '${targetWorkspaceId}'`
    );
  }
}
