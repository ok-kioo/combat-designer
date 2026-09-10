import type { Principal } from "@combat-designer/backend";
import { PrincipalSchema, McpError, TokenService } from "@combat-designer/backend";

export class GatewayAuthenticator {
  private readonly tokenService: TokenService;

  constructor(tokenService: TokenService = new TokenService()) {
    this.tokenService = tokenService;
  }

  authenticate(candidate: unknown): Principal {
    if (!candidate) {
      throw new McpError("UNAUTHENTICATED", "Authentication required: principal context or token is missing.");
    }

    // 1. If candidate is a token string (or Bearer string)
    if (typeof candidate === "string") {
      const token = candidate.startsWith("Bearer ") ? candidate.slice(7).trim() : candidate.trim();
      return this.derivePrincipalFromToken(token);
    }

    // 2. If candidate is an object with token or authorization property
    if (typeof candidate === "object" && candidate !== null) {
      const cand = candidate as Record<string, unknown>;
      const rawToken = cand.token || cand.authorization;
      if (typeof rawToken === "string") {
        const token = rawToken.startsWith("Bearer ") ? rawToken.slice(7).trim() : rawToken.trim();
        // Client/LLM cannot forge or choose principal_id; derive strictly from token
        return this.derivePrincipalFromToken(token);
      }
    }

    // 3. If candidate is a direct Principal object (for internal/test callers)
    const parseResult = PrincipalSchema.safeParse(candidate);
    if (!parseResult.success) {
      throw new McpError(
        "UNAUTHENTICATED",
        `Invalid principal structure or token: ${parseResult.error.message}`
      );
    }

    return parseResult.data;
  }

  public derivePrincipalFromToken(token: string): Principal {
    try {
      const claims = this.tokenService.verifyAccessToken(token);
      return {
        principal_id: claims.sub,
        principal_type: "human",
        capabilities: [
          "combat:read",
          "combat:query",
          "combat:simulate",
          "combat:verify",
          "combat:propose",
          "changeset:withdraw",
          "changeset:approve",
          "changeset:apply",
        ],
        authorized_workspaces: ["*"],
      };
    } catch (err: any) {
      throw new McpError(
        "UNAUTHENTICATED",
        `Token verification failed: ${err.message || "Invalid or expired access token"}`
      );
    }
  }
}
