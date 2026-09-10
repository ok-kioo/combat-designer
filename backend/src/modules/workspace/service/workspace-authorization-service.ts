import type { WorkspaceRepositoryPort } from "../domain/repository/workspace-repository-port.js";
import type {
  WorkspaceAuthorizationPort,
  AuthorizationResult,
} from "../domain/port/workspace-authorization-port.js";

/**
 * Application Authorization Service implementing WorkspaceAuthorizationPort.
 * Enforces ownership: workspace.owner_user_id === authenticated_user.id.
 */
export class WorkspaceAuthorizationService implements WorkspaceAuthorizationPort {
  private readonly workspaceRepo: WorkspaceRepositoryPort;

  constructor(workspaceRepo: WorkspaceRepositoryPort) {
    this.workspaceRepo = workspaceRepo;
  }

  public async authorize(userId: string, workspaceId: string): Promise<AuthorizationResult> {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return {
        authorized: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "User ID is required for authorization",
      };
    }

    if (!workspaceId || typeof workspaceId !== "string" || workspaceId.trim() === "") {
      return {
        authorized: false,
        status: 403,
        code: "FORBIDDEN",
        message: "Workspace ID is required",
      };
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      return {
        authorized: false,
        status: 404,
        code: "NOT_FOUND",
        message: `Workspace '${workspaceId}' not found`,
      };
    }

    if (workspace.owner_user_id !== userId) {
      return {
        authorized: false,
        status: 403,
        code: "FORBIDDEN",
        message: `User '${userId}' is not the owner of workspace '${workspaceId}'`,
      };
    }

    return {
      authorized: true,
      status: 200,
      code: "OK",
      message: "Authorized",
      workspace,
    };
  }
}
