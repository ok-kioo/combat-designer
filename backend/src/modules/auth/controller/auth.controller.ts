import type http from "node:http";
import type { AuthService } from "../service/auth-service.js";
import type { AuthMiddleware } from "../../../infrastructure/middleware/auth.middleware.js";

export class AuthController {
  private readonly authService: AuthService;
  private readonly authMiddleware: AuthMiddleware;

  constructor(authService: AuthService, authMiddleware: AuthMiddleware) {
    this.authService = authService;
    this.authMiddleware = authMiddleware;
  }

  public async register(body: any, res: http.ServerResponse): Promise<void> {
    try {
      const result = await this.authService.register({
        email: body.email,
        password: body.password,
        display_name: body.display_name || body.name,
        initialWorkspaceId: body.workspace_id,
      });

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: result.user,
          workspace_id: result.workspace_id,
          access_token: result.tokens.access_token,
          refresh_token: result.tokens.refresh_token,
          token_type: result.tokens.token_type,
          expires_in: result.tokens.expires_in,
          tokens: result.tokens,
        })
      );
    } catch (err: any) {
      const isConflict = String(err.message).includes("EMAIL_ALREADY_EXISTS");
      const status = isConflict ? 409 : 400;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: isConflict ? "CONFLICT" : "BAD_REQUEST",
          message: err.message || "Registration failed",
        })
      );
    }
  }

  public async login(body: any, res: http.ServerResponse): Promise<void> {
    try {
      const result = await this.authService.login({
        email: body.email,
        password: body.password,
      });

      const memberships = await this.authService.getMemberships(result.user.id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: result.user,
          access_token: result.tokens.access_token,
          refresh_token: result.tokens.refresh_token,
          token_type: result.tokens.token_type,
          expires_in: result.tokens.expires_in,
          tokens: result.tokens,
          workspace_ids: memberships.map((m) => m.workspace_id),
        })
      );
    } catch (err: any) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "INVALID_CREDENTIALS",
          message: "Incorrect email or password",
        })
      );
    }
  }

  public async refresh(body: any, res: http.ServerResponse): Promise<void> {
    try {
      const refreshToken = body.refresh_token;
      const tokens = await this.authService.refresh(refreshToken);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          tokens,
        })
      );
    } catch (err: any) {
      const isTheft = String(err.message).includes("REVOKED_REFRESH_TOKEN");
      const status = 401;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: isTheft ? "TOKEN_FAMILY_REVOKED" : "INVALID_TOKEN",
          message: err.message || "Refresh token invalid or expired",
        })
      );
    }
  }

  public async logout(body: any, res: http.ServerResponse): Promise<void> {
    try {
      const refreshToken = body.refresh_token;
      await this.authService.logout(refreshToken);
    } catch {
      // Idempotent
    }
    res.writeHead(204);
    res.end();
  }

  public async me(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const auth = await this.authMiddleware.verifyRequest(req);
    if (!auth.authenticated) {
      res.writeHead(auth.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.code, message: auth.message }));
      return;
    }

    const memberships = await this.authService.getMemberships(auth.context.userId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        user: {
          id: auth.context.userId,
          email: auth.context.email,
          display_name: auth.context.displayName,
        },
        memberships,
      })
    );
  }
}
