import { describe, it, expect, beforeEach } from "vitest";
import { TokenService, McpError } from "@combat-designer/backend";
import { GatewayAuthenticator } from "../../gateway/src/auth/authenticator.js";
import { createTestEnvironment } from "./test-helper.js";

describe("SPEC 12 — MCP Authentication & Principal Derivation (12.MCP.1 - 12.MCP.4)", () => {
  let tokenService: TokenService;
  let authenticator: GatewayAuthenticator;
  let env: ReturnType<typeof createTestEnvironment>;

  const secret = "test-mcp-jwt-secret-key-at-least-32-chars!";
  const testUserId = "usr-combat-lead-789";

  beforeEach(() => {
    tokenService = new TokenService(secret, 900);
    authenticator = new GatewayAuthenticator(tokenService);
    env = createTestEnvironment();
    // Inject authenticator into gateway
    (env.gateway as any).authenticator = authenticator;
  });

  it("12.MCP.1 - GatewayAuthenticator deriva principal_id exclusivamente a partir do JWT sub", () => {
    const token = tokenService.signAccessToken({
      sub: testUserId,
      username: "combat_lead",
      display_name: "Combat Lead Designer",
    });

    const principal = authenticator.authenticate(token);
    expect(principal).toBeDefined();
    expect(principal.principal_id).toBe(testUserId);
    expect(principal.principal_type).toBe("human");
    expect(principal.capabilities).toContain("combat:read");
    expect(principal.capabilities).toContain("combat:simulate");
  });

  it("12.MCP.2 - GatewayAuthenticator rejeita tokens inválidos/expirados com McpError UNAUTHENTICATED", () => {
    // 1. Invalid signature
    expect(() => authenticator.authenticate("invalid.jwt.token")).toThrow(McpError);
    try {
      authenticator.authenticate("invalid.jwt.token");
    } catch (err: any) {
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe("UNAUTHENTICATED");
    }

    // 2. Expired token
    const expiredService = new TokenService(secret, -60);
    const expiredToken = expiredService.signAccessToken({
      sub: testUserId,
      username: "expired_user",
      display_name: "Expired User",
    });

    try {
      authenticator.authenticate(expiredToken);
      expect.fail("Should have thrown UNAUTHENTICATED");
    } catch (err: any) {
      expect(err).toBeInstanceOf(McpError);
      expect(err.code).toBe("UNAUTHENTICATED");
      expect(err.message).toMatch(/expired/i);
    }
  });

  it("12.MCP.3 - principal_id forjado ou sobrescrito pelo cliente MCP é ignorado/rejeitado", () => {
    const legitimateToken = tokenService.signAccessToken({
      sub: testUserId,
      username: "legitimate_user",
      display_name: "Legitimate User",
    });

    // Client passes token but attempts to spoof a different principal_id in payload/context
    const candidateWithSpoofedId = {
      token: legitimateToken,
      principal_id: "forged_admin_super_user",
    };

    const derivedPrincipal = authenticator.authenticate(candidateWithSpoofedId);
    expect(derivedPrincipal.principal_id).toBe(testUserId);
    expect(derivedPrincipal.principal_id).not.toBe("forged_admin_super_user");
  });

  it("12.MCP.4 - Tool executions usam o principal_id derivado do token", async () => {
    const token = tokenService.signAccessToken({
      sub: testUserId,
      username: "audited_user",
      display_name: "Audited User",
    });

    const correlationId = "corr-mcp-spec12-001";
    const res = await env.gateway.execute(
      { token },
      "combat_search",
      { workspace_id: "ws-alpha", query: "punch" },
      { correlation_id: correlationId }
    );

    expect(res).toBeDefined();
    expect(res.correlation_id).toBe(correlationId);

    // Verify the gateway audit log recorded the exact principal_id derived from the JWT
    const auditLogs = env.gateway.auditLogger.getEvents();
    const matchingLog = auditLogs.find((e) => e.correlation_id === correlationId);
    expect(matchingLog).toBeDefined();
    expect(matchingLog?.principal_id).toBe(testUserId);
  });
});
