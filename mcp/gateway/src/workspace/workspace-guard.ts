import type { Principal } from "@combat-designer/backend";
import { McpError } from "@combat-designer/backend";

export class GatewayWorkspaceGuard {
  validateWorkspaceAccess(
    principal: Principal,
    requestedWorkspaceId?: string,
    payloadWorkspaceId?: string
  ): string {
    const workspaceId = requestedWorkspaceId || payloadWorkspaceId;

    if (!workspaceId || workspaceId.trim() === "") {
      throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required for this operation.");
    }

    // Check for mismatch between context and payload
    if (requestedWorkspaceId && payloadWorkspaceId && requestedWorkspaceId !== payloadWorkspaceId) {
      throw new McpError(
        "WORKSPACE_MISMATCH",
        `Context workspace '${requestedWorkspaceId}' does not match payload workspace '${payloadWorkspaceId}'.`
      );
    }

    // Check principal's authorized workspaces
    if (!principal.authorized_workspaces.includes(workspaceId) && !principal.authorized_workspaces.includes("*")) {
      throw new McpError(
        "UNAUTHORIZED",
        `Principal '${principal.principal_id}' is not authorized to access workspace '${workspaceId}'.`
      );
    }

    return workspaceId;
  }
}
