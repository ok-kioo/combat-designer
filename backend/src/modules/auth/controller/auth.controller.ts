import type http from "node:http";
import type { AuthService } from "../service/auth-service.js";
import type { AuthMiddleware } from "../../../infrastructure/middleware/auth.middleware.js";
import type { WorkspaceRepositoryPort } from "../../workspace/domain/repository/workspace-repository-port.js";
import { AuthRateLimiter } from "../service/rate-limiter.js";

export class AuthController {
  private readonly authService: AuthService;
  private readonly authMiddleware: AuthMiddleware;
  private readonly workspaceRepo?: WorkspaceRepositoryPort;
  private readonly rateLimiter: AuthRateLimiter;

  constructor(
    authService: AuthService,
    authMiddleware: AuthMiddleware,
    workspaceRepo?: WorkspaceRepositoryPort,
    rateLimiter: AuthRateLimiter = new AuthRateLimiter({ maxAttempts: 5, windowMs: 60000 })
  ) {
    this.authService = authService;
    this.authMiddleware = authMiddleware;
    this.workspaceRepo = workspaceRepo;
    this.rateLimiter = rateLimiter;
  }

  public async register(body: any, res: http.ServerResponse): Promise<void> {
    try {
      const username = body.username || body.email;
      if (!username || typeof username !== "string" || username.trim() === "") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "BAD_REQUEST", message: "A non-empty username is required" }));
        return;
      }

      const result = await this.authService.register({
        username,
        password: body.password,
        display_name: body.display_name || body.name,
        email: body.email,
      });

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: result.user,
          access_token: result.tokens.access_token,
          refresh_token: result.tokens.refresh_token,
          token_type: result.tokens.token_type,
          expires_in: result.tokens.expires_in,
        })
      );
    } catch (err: any) {
      const isConflict =
        String(err.message).includes("USERNAME_ALREADY_EXISTS") ||
        String(err.message).includes("EMAIL_ALREADY_EXISTS");
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

  public async login(
    reqOrBody: any,
    bodyOrReqOrRes: any,
    maybeRes?: http.ServerResponse
  ): Promise<void> {
    let req: http.IncomingMessage | undefined;
    let body: any;
    let res: http.ServerResponse;

    if (maybeRes) {
      if (reqOrBody && typeof reqOrBody === "object" && "socket" in reqOrBody) {
        req = reqOrBody as http.IncomingMessage;
        body = bodyOrReqOrRes;
      } else {
        body = reqOrBody;
        req = bodyOrReqOrRes as http.IncomingMessage;
      }
      res = maybeRes;
    } else {
      body = reqOrBody;
      res = bodyOrReqOrRes as http.ServerResponse;
    }

    const ip = req?.socket?.remoteAddress || "127.0.0.1";
    const username = body?.username || body?.email || "";
    const key = `auth:${ip}:${String(username).trim().toLowerCase()}`;

    // 12.AUTH.9: Login rate limiting
    if (this.rateLimiter.isRateLimited(key)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many login attempts. Please try again later.",
        })
      );
      return;
    }

    try {
      const result = await this.authService.login({
        username: String(username).trim(),
        password: body?.password,
      });

      this.rateLimiter.reset(key);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: result.user,
          access_token: result.tokens.access_token,
          refresh_token: result.tokens.refresh_token,
          token_type: result.tokens.token_type,
          expires_in: result.tokens.expires_in,
        })
      );
    } catch (err: any) {
      this.rateLimiter.recordAttempt(key);

      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "INVALID_CREDENTIALS",
          message: "Incorrect username or password",
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
      const refreshToken = body?.refresh_token;
      if (refreshToken) {
        await this.authService.logout(refreshToken);
      }
    } catch {
      // Idempotent
    }
    res.writeHead(204);
    res.end();
  }

  /**
   * GET /api/auth/me per Spec 12 Section 13:
   * Returns user { id, username, display_name } and owned workspaces [ { id, name, status } ].
   * Never leaks passwords, hashes, refresh tokens, or combat data.
   */
  public async me(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const auth = await this.authMiddleware.verifyRequest(req);
    if (!auth.authenticated) {
      res.writeHead(auth.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.code, message: auth.message }));
      return;
    }

    let ownedWorkspaces: Array<{ id: string; name: string; status: string }> = [];
    if (this.workspaceRepo) {
      const list = await this.workspaceRepo.findByOwner(auth.context.userId);
      ownedWorkspaces = list.map((w) => ({
        id: w.id,
        name: w.name,
        status: w.status,
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        user: {
          id: auth.context.userId,
          username: auth.context.username,
          display_name: auth.context.displayName,
        },
        workspaces: ownedWorkspaces,
      })
    );
  }
}
