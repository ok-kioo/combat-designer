import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import {
  ApiServer,
  validateEnvelope,
  computeSha256,
  computeCanonicalBundleHash,
  checkParserCompatibility,
  ExportBundleManifestSchema,
  type ExportBundleManifest,
  InMemoryGraphDriver,
  initializeGraphSchema,
  projectCanonicalSnapshot,
  queryCancelOptions,
  queryImpactAnalysis,
  validateWorkspaceAccess,
  type Principal,
  type CanonicalCombatSnapshot,
} from "@combat-designer/backend";

describe("SPEC 08 — Functional Tests (08.T.1 – 08.T.15)", () => {
  let server: ApiServer;
  let port: number;
  let baseUrl: string;

  const validWorkspaceId = "ws-delivery-alpha";
  const file1 = "assets/light_punch.asset";
  const content1 = "MonoBehaviour:\n  m_Name: light_punch\n  attackId: light_punch\n  startupFrames: 4\n  activeFrames: 2\n  recoveryFrames: 8\n  damage: 15\n";
  const hash1 = computeSha256(content1);

  const checksums: Record<string, string> = {
    [file1]: hash1,
  };
  const bundleHash = computeCanonicalBundleHash(checksums);

  const validManifest: ExportBundleManifest = {
    schema_version: "1.0.0",
    engine: "unity",
    engine_version: "2026.1",
    project_id: "combat-core",
    project_revision: "rev-001",
    exporter_version: "1.0.0",
    parser_version: "1.0.0",
    format: "unity-yaml-scriptable-object",
    workspace_id: validWorkspaceId,
    exported_at: "2026-09-09T18:00:00Z",
    asset_count: 1,
    checksums,
    bundle_hash: bundleHash,
  };

  beforeEach(async () => {
    port = 3010 + Math.floor(Math.random() * 500);
    baseUrl = `http://127.0.0.1:${port}`;
    server = new ApiServer({ port, operationalSecret: "test-secret" });
    await server.listen();
  });

  afterEach(async () => {
    await server.close();
  });

  function makeRequest(
    method: string,
    urlPath: string,
    body?: string,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlPath, baseUrl);
      const req = http.request(
        u,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }));
        }
      );
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  it("08.T.1: Export Bundle packaging and manifest creation with sha256 checksums", () => {
    expect(validManifest.checksums[file1]).toBe(hash1);
    expect(validManifest.bundle_hash).toBe(bundleHash);
    const parsed = ExportBundleManifestSchema.safeParse(validManifest);
    expect(parsed.success).toBe(true);
  });

  it("08.T.2: Unity, Unreal, and Godot exporter manifests conform to ExportBundleManifestSchema", () => {
    // Unity
    const unityManifest = { ...validManifest, engine: "unity", format: "unity-yaml-scriptable-object" };
    expect(ExportBundleManifestSchema.safeParse(unityManifest).success).toBe(true);

    // Unreal
    const unrealManifest = { ...validManifest, engine: "unreal", format: "unreal-json" };
    expect(ExportBundleManifestSchema.safeParse(unrealManifest).success).toBe(true);

    // Godot
    const godotManifest = { ...validManifest, engine: "godot", format: "godot-tres" };
    expect(ExportBundleManifestSchema.safeParse(godotManifest).success).toBe(true);
  });

  it("08.T.3: Bundle upload HTTP endpoint accepts valid bundle and returns 201 with snapshot hash", async () => {
    const payload = {
      manifest: validManifest,
      files: {
        [file1]: content1,
      },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );

    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.status).toBe("SUCCESS");
    expect(json.workspace_id).toBe(validWorkspaceId);
    expect(json.snapshot_hash).toBeDefined();
    expect(json.summary.processed).toBe(1);
    expect(json.summary.conflicts).toBe(0);
  });

  it("08.T.4: Divergence check: exporter_version mismatch triggers 409 Conflict with version_mismatch", async () => {
    const divergedManifest = {
      ...validManifest,
      exporter_version: "2.0.0", // Major version mismatch with server parser
    };
    const payload = {
      manifest: divergedManifest,
      files: { [file1]: content1 },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );

    expect(res.status).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.status).toBe("CONFLICT");
    expect(json.conflict_type).toBe("version_mismatch");
  });

  it("08.T.5: Missing file or tampered file checksum yields 409 Conflict (checksum_mismatch)", async () => {
    const payload = {
      manifest: validManifest,
      files: {
        [file1]: "tampered content altering hash",
      },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );

    expect(res.status).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.status).toBe("CONFLICT");
    expect(json.conflict_type).toBe("checksum_mismatch");
  });

  it("08.T.6: Workspace authorization allows upload when principal has authorized_workspaces containing target workspace", async () => {
    const payload = {
      manifest: validManifest,
      files: { [file1]: content1 },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": `ws-other, ${validWorkspaceId}` }
    );

    expect(res.status).toBe(201);
  });

  it("08.T.7: Workspace authorization rejects unauthorized principal with 403 Forbidden", async () => {
    const payload = {
      manifest: validManifest,
      files: { [file1]: content1 },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": "ws-unauthorized-only" }
    );

    expect(res.status).toBe(403);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("FORBIDDEN");
  });

  it("08.T.8: Canonical snapshot persistence records mandatory workspace_id", async () => {
    const payload = {
      manifest: validManifest,
      files: { [file1]: content1 },
    };

    await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );

    const statusRes = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceId}/status`,
      undefined,
      { "x-authorized-workspaces": validWorkspaceId }
    );

    expect(statusRes.status).toBe(200);
    const json = JSON.parse(statusRes.body);
    expect(json.workspace_id).toBe(validWorkspaceId);
    expect(json.has_snapshot).toBe(true);
    expect(json.asset_count).toBe(1);
  });

  it("08.T.9: Knowledge Graph projection stamps nodes with workspace_id and indexing", async () => {
    const driver = new InMemoryGraphDriver();
    await initializeGraphSchema(driver);

    const snapshot: CanonicalCombatSnapshot = {
      workspace_id: "ws-alpha",
      project_id: "combat-core",
      project_revision: "rev-1",
      snapshot_hash: "a".repeat(64),
      attacks: [
        {
          id: "light_punch",
          name: { name: "Light Punch", raw_label: "Light Punch", untrusted_text: true },
          startup_frames: 4,
          active_frames: 2,
          recovery_frames: 8,
          damage: 15,
          chip_damage: 0,
          guard_break_value: 0,
          hitstun_frames: 10,
          hitstop_frames: 3,
          blockstun_frames: 5,
          invuln_windows: [],
          armor_windows: [],
          resource_costs: [],
          hitboxes: [],
          cancels: [],
          tags: [],
          provenance: {
            engine: "unity",
            project_revision: "rev-1",
            source_path: "assets/light_punch.asset",
            asset_id: "light_punch",
            parser_version: "1.0.0",
            confidence_permille: 1000,
            status: "canonical",
          },
        },
      ],
    };

    const summary = await projectCanonicalSnapshot(driver, snapshot);
    expect(summary.success).toBe(true);
    expect(summary.workspace_id).toBe("ws-alpha");
    expect(summary.attacks_projected).toBe(1);
  });

  it("08.T.10: Knowledge Graph queries enforce workspace_id isolation (no cross-workspace data return)", async () => {
    const driver = new InMemoryGraphDriver();
    await initializeGraphSchema(driver);

    // Project attack into ws-alpha
    await projectCanonicalSnapshot(driver, {
      workspace_id: "ws-alpha",
      project_id: "proj-1",
      project_revision: "rev-1",
      snapshot_hash: "b".repeat(64),
      attacks: [
        {
          id: "shared_attack_id",
          name: { name: "Alpha Attack", raw_label: "Alpha Attack", untrusted_text: true },
          startup_frames: 4,
          active_frames: 2,
          recovery_frames: 8,
          damage: 20,
          chip_damage: 0,
          guard_break_value: 0,
          hitstun_frames: 10,
          hitstop_frames: 3,
          blockstun_frames: 5,
          invuln_windows: [],
          armor_windows: [],
          resource_costs: [],
          hitboxes: [],
          cancels: [],
          tags: [],
          provenance: {
            engine: "unity",
            project_revision: "rev-1",
            source_path: "assets/shared.asset",
            asset_id: "shared_attack_id",
            parser_version: "1.0.0",
            confidence_permille: 1000,
            status: "canonical",
          },
        },
      ],
    });

    // Query in ws-beta
    const resultBeta = await queryImpactAnalysis(driver, "ws-beta", "shared_attack_id");
    expect(resultBeta.total_connected_entities).toBe(0);

    // Query in ws-alpha
    const resultAlpha = await queryImpactAnalysis(driver, "ws-alpha", "shared_attack_id");
    expect(resultAlpha.attack_id).toBe("shared_attack_id");
  });

  it("08.T.11: Changeset proposal lifecycle scoped strictly to active workspace", () => {
    const principalAlpha: Principal = {
      principal_id: "designer-alpha",
      principal_type: "human",
      capabilities: ["combat:read", "changeset:propose"],
      authorized_workspaces: ["ws-alpha"],
    };

    // Access to ws-alpha passes
    expect(() => validateWorkspaceAccess(principalAlpha, "ws-alpha")).not.toThrow();

    // Access to ws-beta throws WORKSPACE_MISMATCH
    expect(() => validateWorkspaceAccess(principalAlpha, "ws-beta")).toThrow();
  });

  it("08.T.12: Workspace status endpoint validates authorized access", async () => {
    const statusRes = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceId}/status`,
      undefined,
      { "x-authorized-workspaces": "ws-unrelated" }
    );

    expect(statusRes.status).toBe(403);
  });

  it("08.T.13: Workspace state records gate run and simulation history correctly", () => {
    server.recordGateRun(validWorkspaceId, "gate-run-101", "PASS");
    server.recordSimulation(validWorkspaceId, "sim-202");

    const state = server.getWorkspaceState(validWorkspaceId);
    expect(state.history.length).toBe(2);
    expect(state.history[0].type).toBe("simulation");
    expect(state.history[1].type).toBe("gate_run");
    expect(state.history[1].verdict).toBe("PASS");
  });

  it("08.T.14: Workspace mismatch between route param and manifest rejected with 400", async () => {
    const mismatchManifest = {
      ...validManifest,
      workspace_id: "ws-different-than-url",
    };
    const payload = {
      manifest: mismatchManifest,
      files: { [file1]: content1 },
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );

    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("WORKSPACE_MISMATCH");
  });

  it("08.T.15: End-to-end delivery: bundle upload → envelope validation → ingestion pipeline → snapshot → status query", async () => {
    const payload = {
      manifest: validManifest,
      files: { [file1]: content1 },
    };

    const uploadRes = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceId}/bundles`,
      JSON.stringify(payload),
      { "x-authorized-workspaces": validWorkspaceId }
    );
    expect(uploadRes.status).toBe(201);
    const uploadData = JSON.parse(uploadRes.body);

    const statusRes = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceId}/status`,
      undefined,
      { "x-authorized-workspaces": validWorkspaceId }
    );
    expect(statusRes.status).toBe(200);
    const statusData = JSON.parse(statusRes.body);
    expect(statusData.latest_snapshot_hash).toBe(uploadData.snapshot_hash);
    expect(statusData.asset_count).toBe(1);
    expect(statusData.quarantined_count).toBe(0);
    expect(statusData.conflicts_count).toBe(0);
  });
});
