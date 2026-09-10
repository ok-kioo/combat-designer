import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ApiServer } from "../../../src/infrastructure/http/server.js";

describe("SPEC 12 — Authentication and Tenant Security Integration Tests", () => {
  let server: ApiServer;
  let baseUrl: string;
  const port = 3591;

  beforeAll(async () => {
    server = new ApiServer({ port });
    await server.listen();
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Seed test workspace state
    const aliceState = server.getWorkspaceState("ws-alice");
    aliceState.has_snapshot = true;
    aliceState.latest_snapshot_hash = "hash-alice-123";
    aliceState.latest_envelope = {
      workspace_id: "ws-alice",
      project_id: "p-alice",
      revision: "rev-1",
      snapshot_id: "snap-1",
      snapshot_hash: "hash-alice-123",
      parser_version: "1.0",
      schema_version: "1.0",
      canonical_snapshot: {
        workspace_id: "ws-alice",
        project_id: "p-alice",
        project_revision: "rev-1",
        snapshot_hash: "hash-alice-123",
        attacks: [
          {
            id: "atk_alice_jab",
            name: { name: "Alice Jab", raw_label: "Alice Jab", untrusted_text: false },
            startup_frames: 4,
            active_frames: 2,
            recovery_frames: 6,
            damage: 20,
            hitstun_frames: 10,
            hitstop_frames: 3,
            blockstun_frames: 6,
            chip_damage: 0,
            guard_break_value: 0,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [],
            tags: ["punch"],
          },
        ],
        hitboxes: [],
        cancel_rules: [],
        combat_states: [],
        resources: [],
        archetypes: [],
        scenarios: [],
        provenance: [],
      },
    };

    const bobState = server.getWorkspaceState("ws-bob");
    bobState.has_snapshot = true;
    bobState.latest_snapshot_hash = "hash-bob-456";
    bobState.latest_envelope = {
      workspace_id: "ws-bob",
      project_id: "p-bob",
      revision: "rev-1",
      snapshot_id: "snap-2",
      snapshot_hash: "hash-bob-456",
      parser_version: "1.0",
      schema_version: "1.0",
      canonical_snapshot: {
        workspace_id: "ws-bob",
        project_id: "p-bob",
        project_revision: "rev-1",
        snapshot_hash: "hash-bob-456",
        attacks: [],
        hitboxes: [],
        cancel_rules: [],
        combat_states: [],
        resources: [],
        archetypes: [],
        scenarios: [],
        provenance: [],
      },
    };
  });

  describe("12.T.1 - User Registration Flow", () => {
    it("should register a new user, create membership, and return tokens without sensitive password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
          name: "Alice Designer",
          workspace_id: "ws-alice",
          role: "owner",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("alice@studio.com");
      expect(data.user.password).toBeUndefined();
      expect(data.user.password_hash).toBeUndefined();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();
    });

    it("should reject duplicate email registration", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AnotherPassword123!",
          name: "Alice Clone",
        }),
      });

      expect(res.status).toBe(409);
    });
  });

  describe("12.T.2 - Login Flow & User Enumeration Protection", () => {
    it("should login successfully with valid credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();
      expect(data.token_type).toBe("Bearer");
      expect(data.expires_in).toBe(900);
      expect(data.workspace_ids).toContain("ws-alice");
    });

    it("should reject login with incorrect password and not leak existence", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "WrongPassword!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("should reject non-existent user with the same generic error", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@studio.com",
          password: "AnyPassword123!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("should support default pre-seeded developer credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "developer@combatdesigner.io",
          password: "CombatDesigner2026!",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.access_token).toBeDefined();
      expect(data.workspace_ids).toContain("ws-default");
    });
  });

  describe("12.T.3 - Refresh Token Rotation and Family Theft Detection", () => {
    it("should rotate refresh token and issue new token pair", async () => {
      // Login first
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const firstRefreshToken = loginData.refresh_token;

      // Refresh
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: firstRefreshToken }),
      });

      expect(refreshRes.status).toBe(200);
      const refreshData = await refreshRes.json();
      expect(refreshData.access_token).toBeDefined();
      expect(refreshData.refresh_token).toBeDefined();
      expect(refreshData.refresh_token).not.toBe(firstRefreshToken);

      // Reusing the first refresh token MUST trigger family revocation
      const reuseRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: firstRefreshToken }),
      });
      expect(reuseRes.status).toBe(401);
      const reuseData = await reuseRes.json();
      expect(reuseData.error).toBe("TOKEN_FAMILY_REVOKED");

      // The new refresh token should also be revoked due to family compromise
      const followUpRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshData.refresh_token }),
      });
      expect(followUpRes.status).toBe(401);
    });
  });

  describe("12.T.4 - Fail-Closed Tenant Isolation & Workspace Authorization", () => {
    it("SPEC 12 CORE AUDIT FIX: request without token and without header returns 401 UNAUTHENTICATED (never 200)", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/ws-alice/attacks`, {
        method: "GET",
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHENTICATED");
    });

    it("request with invalid Bearer token returns 401 UNAUTHENTICATED", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/ws-alice/attacks`, {
        method: "GET",
        headers: {
          Authorization: "Bearer invalid.fake.token",
        },
      });

      expect(res.status).toBe(401);
    });

    it("request with valid Bearer token for authorized workspace returns 200 OK", async () => {
      // Login as Alice
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const aliceToken = loginData.access_token;

      // Access Alice's workspace
      const res = await fetch(`${baseUrl}/api/workspaces/ws-alice/attacks`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.attacks).toBeDefined();
      expect(data.attacks).toHaveLength(1);
      expect(data.attacks[0].name).toBe("Alice Jab");
    });

    it("request with valid Bearer token for a workspace the user is NOT a member of returns 403 FORBIDDEN", async () => {
      // Login as Alice
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const aliceToken = loginData.access_token;

      // Alice tries to access Bob's workspace
      const res = await fetch(`${baseUrl}/api/workspaces/ws-bob/attacks`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });
  });

  describe("12.T.5 - Profile and Logout", () => {
    it("GET /api/auth/me returns user profile and memberships", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const aliceToken = loginData.access_token;

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(meRes.status).toBe(200);
      const meData = await meRes.json();
      expect(meData.user.email).toBe("alice@studio.com");
      expect(meData.memberships.some((m: any) => m.workspace_id === "ws-alice")).toBe(true);
    });

    it("POST /api/auth/logout revokes refresh token", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alice@studio.com",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const tokenToRevoke = loginData.refresh_token;

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokenToRevoke }),
      });
      expect(logoutRes.status).toBe(204);

      // Now attempting to refresh with revoked token should fail
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokenToRevoke }),
      });
      expect(refreshRes.status).toBe(401);
    });
  });
});
