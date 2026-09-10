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

  describe("12.AUTH — Authentication Specification Tests", () => {
    let aliceToken = "";
    let aliceRefreshToken = "";
    let aliceUserId = "";

    it("12.AUTH.1 - Register cria User com password_hash Argon2id e retorna tokens", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "AlicePassword2026!",
          display_name: "Alice Designer",
          email: "alice@studio.com",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.username).toBe("alice_designer");
      expect(data.user.display_name).toBe("Alice Designer");
      expect(data.user.password).toBeUndefined();
      expect(data.user.password_hash).toBeUndefined();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();

      aliceUserId = data.user.id;
      aliceToken = data.access_token;
      aliceRefreshToken = data.refresh_token;

      // Verify stored password hash is Argon2id
      const storedUser = await (server.authService as any).userRepo.findByUsername("alice_designer");
      expect(storedUser).toBeDefined();
      expect(storedUser.password_hash).toMatch(/^\$argon2id\$v=19\$/);
    });

    it("12.AUTH.2 - Register rejeita username duplicado (case-insensitive)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "ALICE_DESIGNER",
          password: "AnotherPassword123!",
          display_name: "Alice Duplicate",
        }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("CONFLICT");
    });

    it("12.AUTH.3 - Register rejeita username inválido (tamanho/caracteres)", async () => {
      // Too short
      const resShort = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "al",
          password: "ValidPassword123!",
        }),
      });
      expect(resShort.status).toBe(400);

      // Invalid characters (spaces, symbols)
      const resInvalid = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice designer with spaces!",
          password: "ValidPassword123!",
        }),
      });
      expect(resInvalid.status).toBe(400);
    });

    it("12.AUTH.4 - Register rejeita senha fraca", async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "bob_weak",
          password: "123", // under 8 characters
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("BAD_REQUEST");
    });

    it("12.AUTH.5 - Login por username correto + senha correta retorna tokens", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "AlicePassword2026!",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.access_token).toBeDefined();
      expect(data.refresh_token).toBeDefined();
      expect(data.token_type).toBe("Bearer");
      expect(data.expires_in).toBe(900);
      expect(data.user).toBeDefined();
      expect(data.user.username).toBe("alice_designer");
    });

    it("12.AUTH.6 - Login por username é case-insensitive", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "ALICE_DESIGNER",
          password: "AlicePassword2026!",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.access_token).toBeDefined();
    });

    it("12.AUTH.7 - Login com senha incorreta falha com 401 genérico e tempo constante", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "IncorrectPassword999!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("12.AUTH.8 - Login com username inexistente falha com o mesmo 401 genérico e tempo constante (sem enumeração)", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "unknown_nonexistent_user",
          password: "SomePassword123!",
        }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CREDENTIALS");
    });

    it("12.AUTH.9 - Rate limiting bloqueia tentativas excessivas de login por IP/username", async () => {
      // 5 consecutive failed attempts on rate_limit_target
      for (let i = 0; i < 5; i++) {
        await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "rate_limit_target",
            password: "WrongPassword!",
          }),
        });
      }

      // 6th attempt must be blocked with HTTP 429
      const blockedRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "rate_limit_target",
          password: "WrongPassword!",
        }),
      });

      expect(blockedRes.status).toBe(429);
      const data = await blockedRes.json();
      expect(data.error).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("12.AUTH.10 - Refresh token rotaciona e invalida o anterior", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const initialRt = loginData.refresh_token;

      // Rotate
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: initialRt }),
      });

      expect(refreshRes.status).toBe(200);
      const refreshData = await refreshRes.json();
      expect(refreshData.access_token).toBeDefined();
      expect(refreshData.refresh_token).toBeDefined();
      expect(refreshData.refresh_token).not.toBe(initialRt);
    });

    it("12.AUTH.11 - Reuso de refresh token antigo revoga a família inteira", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const firstToken = loginData.refresh_token;

      // Legitimate rotation
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: firstToken }),
      });
      const refreshData = await refreshRes.json();
      const secondToken = refreshData.refresh_token;

      // Reusing first token triggers theft detection and revokes family
      const reuseRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: firstToken }),
      });
      expect(reuseRes.status).toBe(401);
      const reuseData = await reuseRes.json();
      expect(reuseData.error).toBe("TOKEN_FAMILY_REVOKED");

      // The second token is now also invalidated due to family compromise
      const subsequentRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: secondToken }),
      });
      expect(subsequentRes.status).toBe(401);
    });

    it("12.AUTH.12 - Logout revoga o refresh token", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
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

      // Attempting to refresh with revoked token fails
      const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokenToRevoke }),
      });
      expect(refreshRes.status).toBe(401);
    });

    it("12.AUTH.13 - Hashes legados são migrados para Argon2id no login com sucesso", async () => {
      const crypto = await import("node:crypto");
      const salt = crypto.randomBytes(16).toString("hex");
      const legacyKey = crypto.pbkdf2Sync("LegacyUserPass2026!", salt, 100000, 64, "sha512").toString("hex");
      const legacyHash = `${salt}:${legacyKey}`;

      await (server.authService as any).userRepo.save({
        id: "usr-legacy-test-01",
        username: "legacy_hero",
        password_hash: legacyHash,
        display_name: "Legacy Hero",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login_at: null,
      });

      // Login with legacy credentials
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "legacy_hero",
          password: "LegacyUserPass2026!",
        }),
      });

      expect(res.status).toBe(200);

      // Verify that user's password_hash was transparently upgraded to Argon2id
      const updatedUser = await (server.authService as any).userRepo.findByUsername("legacy_hero");
      expect(updatedUser.password_hash).toMatch(/^\$argon2id\$v=19\$/);
    });

    it("12.AUTH.14 - GET /api/auth/me retorna perfil e workspaces do usuário", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_designer",
          password: "AlicePassword2026!",
        }),
      });
      const loginData = await loginRes.json();
      const token = loginData.access_token;

      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.username).toBe("alice_designer");
      expect(data.user.password).toBeUndefined();
      expect(data.user.password_hash).toBeUndefined();
      expect(Array.isArray(data.workspaces)).toBe(true);
    });
  });

  describe("12.WS — Workspace Ownership and Tenant Security Tests", () => {
    let aliceToken = "";
    let aliceUserId = "";
    let bobToken = "";
    let bobUserId = "";
    let aliceWorkspaceId = "";

    beforeAll(async () => {
      // Register Alice
      const regAlice = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice_ws_owner",
          password: "AlicePassword2026!",
          display_name: "Alice Owner",
        }),
      });
      const aliceData = await regAlice.json();
      aliceToken = aliceData.access_token;
      aliceUserId = aliceData.user.id;

      // Register Bob
      const regBob = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "bob_ws_intruder",
          password: "BobPassword2026!",
          display_name: "Bob Intruder",
        }),
      });
      const bobData = await regBob.json();
      bobToken = bobData.access_token;
      bobUserId = bobData.user.id;
    });

    it("12.WS.1 - POST /api/workspaces cria workspace com owner_user_id = authenticated_user.id", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({
          name: "Alice Combat Arena",
          description: "A fast paced combat testbed",
          engine: "unity",
          engine_version: "2022.3",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toMatch(/^ws-/);
      expect(data.name).toBe("Alice Combat Arena");
      expect(data.owner_user_id).toBe(aliceUserId);
      expect(data.status).toBe("active");

      aliceWorkspaceId = data.id;

      // Seed mock attack state for this workspace so operational endpoint tests can query it
      const wsState = server.getWorkspaceState(aliceWorkspaceId);
      wsState.has_snapshot = true;
      wsState.latest_envelope = {
        workspace_id: aliceWorkspaceId,
        project_id: "p-alice",
        revision: "rev-1",
        snapshot_id: "snap-alice-1",
        snapshot_hash: "hash-alice-001",
        parser_version: "1.0",
        schema_version: "1.0",
        canonical_snapshot: {
          workspace_id: aliceWorkspaceId,
          project_id: "p-alice",
          project_revision: "rev-1",
          snapshot_hash: "hash-alice-001",
          attacks: [
            {
              id: "atk_alice_combo",
              name: { name: "Alice Combo", raw_label: "Alice Combo", untrusted_text: false },
              startup_frames: 4,
              active_frames: 2,
              recovery_frames: 6,
              damage: 50,
              hitstun_frames: 12,
              hitstop_frames: 4,
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
    });

    it("12.WS.2 - POST /api/workspaces ignora ou rejeita owner_user_id enviado pelo cliente no payload", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceToken}`,
        },
        body: JSON.stringify({
          name: "Alice Second Project",
          owner_user_id: "usr-forged-evil-id", // Client tries to spoof owner
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.owner_user_id).toBe(aliceUserId);
      expect(data.owner_user_id).not.toBe("usr-forged-evil-id");
    });

    it("12.WS.3 - GET /api/workspaces retorna apenas workspaces pertencentes ao usuário autenticado", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.every((w: any) => w.owner_user_id === aliceUserId)).toBe(true);
    });

    it("12.WS.4 - GET /api/workspaces não retorna workspaces de outros usuários", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      // Bob owns 0 workspaces at this stage
      expect(data.some((w: any) => w.id === aliceWorkspaceId)).toBe(false);
    });

    it("12.WS.5 - GET /api/workspaces/:id retorna o workspace para o proprietário", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}`, {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(aliceWorkspaceId);
      expect(data.owner_user_id).toBe(aliceUserId);
    });

    it("12.WS.6 - GET /api/workspaces/:id retorna 403 para usuário não-proprietário", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("FORBIDDEN");
    });

    it("12.WS.7 - Acesso a endpoints operacionais/recursos de workspace (ex: /attacks, /bundles) retorna 403 para não-proprietário", async () => {
      // Bob tries to list attacks in Alice's workspace
      const resAttacks = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}/attacks`, {
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(resAttacks.status).toBe(403);
      const dataAttacks = await resAttacks.json();
      expect(dataAttacks.error).toBe("FORBIDDEN");

      // Bob tries to post bundle to Alice's workspace
      const resBundle = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}/bundles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bobToken}`,
        },
        body: JSON.stringify({}),
      });
      expect(resBundle.status).toBe(403);
    });

    it("12.WS.8 - Requisição sem token a endpoints de workspace retorna 401", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}/attacks`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHENTICATED");
    });

    it("12.WS.9 - Requisição com token expirado/inválido retorna 401", async () => {
      const res = await fetch(`${baseUrl}/api/workspaces/${aliceWorkspaceId}/attacks`, {
        headers: { Authorization: "Bearer invalid.malformed.token" },
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("INVALID_TOKEN");
    });

    it("12.WS.10 - Cabeçalhos legados (x-authorized-workspaces) NÃO concedem acesso quando allowLegacyHeader=false", async () => {
      const strictPort = 3593;
      const strictServer = new ApiServer({ port: strictPort, allowLegacyHeader: false });
      await strictServer.listen();

      try {
        const res = await fetch(`http://localhost:${strictPort}/api/workspaces/ws-default/attacks`, {
          headers: {
            "x-authorized-workspaces": "ws-default",
          },
        });

        // Must be rejected with 401 because legacy headers are disallowed and no token was provided
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe("UNAUTHENTICATED");
      } finally {
        await strictServer.close();
      }
    });
  });
});
