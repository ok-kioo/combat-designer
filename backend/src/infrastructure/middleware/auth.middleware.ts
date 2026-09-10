import type http from "node:http";
import type { AccessTokenClaims, WorkspaceRole } from "../../modules/auth/domain/entity/auth.entity.js";
import type { AuthService } from "../../modules/auth/service/auth-service.js";

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  workspaces: Array<{ workspace_id: string; role: WorkspaceRole }>;
}

export type AuthResult =
  | { authenticated: true; context: AuthContext }
  | { authenticated: false; status: 401 | 403; code: string; message: string };

export class AuthMiddleware {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * Extracts the Bearer token from the incoming HTTP request.
   */
  public extractBearerToken(req: http.IncomingMessage): string | null {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return null;

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      return parts[1];
    }
    return null;
  }

  /**
   * Verifies the request token and checks workspace membership.
   * Fail-Closed: any error, missing token, or unverified workspace yields a 401 or 403.
   */
  public async verifyRequest(
    req: http.IncomingMessage,
    targetWorkspaceId?: string
  ): Promise<AuthResult> {
    const token = this.extractBearerToken(req);

    if (!token) {
      return {
        authenticated: false,
        status: 401,
        code: "UNAUTHENTICATED",
        message: "Authorization required: Bearer access token is missing",
      };
    }

    let claims: AccessTokenClaims;
    try {
      claims = this.authService.verifyAccessToken(token);
    } catch (err: any) {
      const isExpired = String(err.message).includes("TOKEN_EXPIRED");
      return {
        authenticated: false,
        status: 401,
        code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
        message: err.message || "Failed to verify access token",
      };
    }

    const context: AuthContext = {
      userId: claims.sub,
      email: claims.email,
      displayName: claims.display_name,
      workspaces: claims.workspaces,
    };

    // If workspace-specific route, verify membership
    if (targetWorkspaceId) {
      // 1. Check claim snapshot
      const hasClaim = claims.workspaces.some(
        (w) => w.workspace_id === targetWorkspaceId || w.workspace_id === "*"
      );

      // 2. Revalidate with repository for writing/stale protection
      const isAuthorizedInDb = await this.authService.isUserAuthorizedForWorkspace(
        claims.sub,
        targetWorkspaceId
      );

      if (!hasClaim && !isAuthorizedInDb) {
        return {
          authenticated: false,
          status: 403,
          code: "FORBIDDEN",
          message: `User '${claims.email}' is not a member of workspace '${targetWorkspaceId}'`,
        };
      }
    }

    return { authenticated: true, context };
  }
}
