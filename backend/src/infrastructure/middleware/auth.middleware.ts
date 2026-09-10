import type http from "node:http";
import type { AccessTokenClaims } from "../../modules/auth/domain/entity/auth.entity.js";
import type { AuthService } from "../../modules/auth/service/auth-service.js";
import type { WorkspaceAuthorizationPort } from "../../modules/workspace/domain/port/workspace-authorization-port.js";

export interface AuthContext {
  userId: string;
  username: string;
  displayName: string;
}

export type AuthResult =
  | { authenticated: true; context: AuthContext }
  | { authenticated: false; status: 401 | 403 | 404; code: string; message: string };

export class AuthMiddleware {
  private readonly authService: AuthService;
  private readonly authorizationPort?: WorkspaceAuthorizationPort;

  constructor(
    authService: AuthService,
    authorizationPort?: WorkspaceAuthorizationPort
  ) {
    this.authService = authService;
    this.authorizationPort = authorizationPort;
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
   * Verifies the request token and checks workspace ownership.
   * Fail-Closed: any error, missing token, or unauthorized project yields 401 or 403.
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
      username: claims.username,
      displayName: claims.display_name,
    };

    // If workspace-specific route, verify project ownership (User 1 --- N Workspace)
    if (targetWorkspaceId) {
      if (this.authorizationPort) {
        const authResult = await this.authorizationPort.authorize(claims.sub, targetWorkspaceId);
        if (!authResult.authorized) {
          return {
            authenticated: false,
            status: (authResult.status === 200 ? 403 : authResult.status) as 401 | 403 | 404,
            code: authResult.code,
            message: authResult.message,
          };
        }
      } else {
        const isAuthorized = await this.authService.isUserAuthorizedForWorkspace(
          claims.sub,
          targetWorkspaceId
        );
        if (!isAuthorized) {
          return {
            authenticated: false,
            status: 403,
            code: "FORBIDDEN",
            message: `User '${claims.username}' does not own workspace '${targetWorkspaceId}'`,
          };
        }
      }
    }

    return { authenticated: true, context };
  }

  /**
   * Alias for verifyRequest to facilitate consistent controller and server call sites.
   */
  public async authenticate(
    req: http.IncomingMessage,
    targetWorkspaceId?: string
  ): Promise<AuthResult> {
    return this.verifyRequest(req, targetWorkspaceId);
  }
}
