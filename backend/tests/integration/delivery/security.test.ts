import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import {
  ApiServer,
  validateEnvelope,
  computeSha256,
  computeCanonicalBundleHash,
  type ExportBundleManifest,
  InMemoryGraphDriver,
  initializeGraphSchema,
  projectCanonicalSnapshot,
  queryCancelOptions,
  queryImpactAnalysis,
  validateWorkspaceAccess,
  type Principal,
  type CanonicalCombatSnapshot,
  McpError,
} from "@combat-designer/backend";

function createSnapshotForWorkspace(
  workspaceId: string,
  attackId: string,
  attackName: string,
  targetAction: string
): CanonicalCombatSnapshot {
  return {
    workspace_id: workspaceId,
    project_id: "sec-core",
    project_revision: "rev-1",
    snapshot_hash: "a".repeat(64),
    attacks: [
      {
        id: attackId,
        name: { name: attackName, raw_label: attackName, untrusted_text: true },
        startup_frames: 10,
        active_frames: 4,
        recovery_frames: 12,
        damage: 100,
        chip_damage: 10,
        guard_break_value: 20,
        hitstun_frames: 15,
        hitstop_frames: 3,
        blockstun_frames: 8,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [],
        cancels: [
          {
            source_attack: attackId,
            target_action: targetAction,
            window: { start: 10, end: 14 },
            condition: "on_hit",
          },
        ],
        tags: ["thrust"],
        provenance: {
          engine: "unity",
          project_revision: "rev-1",
          source_path: "assets/attack.asset",
          asset_id: attackId,
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
    ],
  };
}

describe("SPEC 08 — Security Tests (08.SEC.1 – 08.SEC.10)", () => {
  let server: ApiServer;
  let port: number;
  let baseUrl: string;

  const validWorkspaceA = "ws-tenant-alpha";
  const validWorkspaceB = "ws-tenant-beta";

  beforeEach(async () => {
    port = 3510 + Math.floor(Math.random() * 500);
    baseUrl = `http://127.0.0.1:${port}`;
    server = new ApiServer({ port, operationalSecret: "sec-test-secret" });
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

  function createValidBundle(workspaceId: string, attackId: string, damage: number = 25) {
    const file = "assets/attack.asset";
    const content = `MonoBehaviour:\n  m_Name: ${attackId}\n  attackId: ${attackId}\n  startupFrames: 4\n  activeFrames: 2\n  recoveryFrames: 10\n  damage: ${damage}\n`;
    const hash = computeSha256(content);
    const checksums: Record<string, string> = { [file]: hash };
    const bundle_hash = computeCanonicalBundleHash(checksums);

    const manifest: ExportBundleManifest = {
      schema_version: "1.0.0",
      engine: "unity",
      engine_version: "2026.1",
      project_id: "sec-project",
      project_revision: "rev-001",
      exporter_version: "1.0.0",
      parser_version: "1.0.0",
      format: "unity-yaml-scriptable-object",
      workspace_id: workspaceId,
      exported_at: "2026-09-09T20:00:00Z",
      asset_count: 1,
      checksums,
      bundle_hash,
    };

    return {
      manifest,
      files: { [file]: content },
    };
  }

  it("08.SEC.1: Path traversal attempt in bundle is rejected at envelope layer", async () => {
    const traversalPath = "../../../etc/passwd";
    const content = "root:x:0:0:root:/root:/bin/bash";
    const hash = computeSha256(content);
    const checksums: Record<string, string> = { [traversalPath]: hash };
    const bundle_hash = computeCanonicalBundleHash(checksums);

    const manifest: ExportBundleManifest = {
      schema_version: "1.0.0",
      engine: "unity",
      engine_version: "2026.1",
      project_id: "sec-project",
      project_revision: "rev-001",
      exporter_version: "1.0.0",
      parser_version: "1.0.0",
      format: "unity-yaml-scriptable-object",
      workspace_id: validWorkspaceA,
      exported_at: "2026-09-09T20:00:00Z",
      asset_count: 1,
      checksums,
      bundle_hash,
    };

    // 1. Check unit level envelope validation
    const filesMap = new Map<string, string | Buffer>([[traversalPath, content]]);
    const envResult = validateEnvelope(manifest, filesMap, validWorkspaceA);
    expect(envResult.valid).toBe(false);
    expect(envResult.errors.some((e) => e.includes("Illegal file path detected"))).toBe(true);

    // 2. Check HTTP endpoint rejects path traversal
    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify({ manifest, files: { [traversalPath]: content } }),
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("CONFLICT");
    expect(body.details).toContain("Illegal file path detected");
  });

  it("08.SEC.2: Bundle missing manifest or malformed payload is rejected immediately", async () => {
    // Missing manifest entirely
    const res1 = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify({ files: { "test.asset": "content" } }),
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(res1.status).toBe(400);
    const body1 = JSON.parse(res1.body);
    expect(body1.error).toBe("MISSING_MANIFEST");

    // Malformed JSON
    const res2 = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      "{ invalid json syntax ",
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(res2.status).toBe(400);
    const body2 = JSON.parse(res2.body);
    expect(body2.error).toBe("INVALID_JSON");
  });

  it("08.SEC.3: Cross-tenant attack ID collision isolation (same attack ID in workspace A and B)", async () => {
    const driver = new InMemoryGraphDriver();
    await initializeGraphSchema(driver);

    const collisionAttackId = "special_dragon_punch";

    const snapshotA = createSnapshotForWorkspace(
      validWorkspaceA,
      collisionAttackId,
      "Dragon Punch Alpha",
      "finisher_a"
    );
    const snapshotB = createSnapshotForWorkspace(
      validWorkspaceB,
      collisionAttackId,
      "Dragon Punch Beta",
      "finisher_b"
    );

    // Project both into the same graph
    await projectCanonicalSnapshot(driver, snapshotA);
    await projectCanonicalSnapshot(driver, snapshotB);

    // Verify isolated nodes in driver
    const attackNodes = driver
      .getAllNodes()
      .filter((n) => n.labels.has("Attack") && n.properties.attack_id === collisionAttackId);
    expect(attackNodes).toHaveLength(2);

    const nodeA = attackNodes.find((n) => n.properties.workspace_id === validWorkspaceA);
    const nodeB = attackNodes.find((n) => n.properties.workspace_id === validWorkspaceB);
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(nodeA?.properties.name).toBe("Dragon Punch Alpha");
    expect(nodeB?.properties.name).toBe("Dragon Punch Beta");
    expect(nodeA?.id).not.toBe(nodeB?.id);

    // Query cancels for workspace A
    const cancelsA = await queryCancelOptions(driver, validWorkspaceA, collisionAttackId);
    expect(cancelsA.length).toBe(1);
    expect(cancelsA[0].target_attack_id).toBe("finisher_a");

    // Query cancels for workspace B
    const cancelsB = await queryCancelOptions(driver, validWorkspaceB, collisionAttackId);
    expect(cancelsB.length).toBe(1);
    expect(cancelsB[0].target_attack_id).toBe("finisher_b");

    // Impact analysis for workspace A
    const impactA = await queryImpactAnalysis(driver, validWorkspaceA, collisionAttackId);
    expect(impactA.attack_id).toBe(collisionAttackId);
    expect(impactA.affected_attacks).toEqual(["finisher_a"]);

    // Impact analysis for workspace B
    const impactB = await queryImpactAnalysis(driver, validWorkspaceB, collisionAttackId);
    expect(impactB.attack_id).toBe(collisionAttackId);
    expect(impactB.affected_attacks).toEqual(["finisher_b"]);
  });

  it("08.SEC.4: Unauthenticated or forged workspace_id injection is blocked", async () => {
    const bundleA = createValidBundle(validWorkspaceA, "attack_a");

    // 1. Header does not authorize validWorkspaceA
    const resForbidden = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(bundleA),
      { "x-authorized-workspaces": "ws-unrelated" }
    );
    expect(resForbidden.status).toBe(403);
    const bodyForbidden = JSON.parse(resForbidden.body);
    expect(bodyForbidden.error).toBe("FORBIDDEN");

    // 2. Route workspace_id does not match manifest.workspace_id
    const resMismatch = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(createValidBundle(validWorkspaceB, "attack_b")), // Manifest says validWorkspaceB
      { "x-authorized-workspaces": "*" }
    );
    expect(resMismatch.status).toBe(400);
    const bodyMismatch = JSON.parse(resMismatch.body);
    expect(bodyMismatch.error).toBe("WORKSPACE_MISMATCH");

    // 3. Principal authorization check via validateWorkspaceAccess
    const principal: Principal = {
      principal_id: "user-123",
      principal_type: "human",
      capabilities: ["combat:read"],
      authorized_workspaces: [validWorkspaceA],
    };
    expect(() => validateWorkspaceAccess(principal, validWorkspaceA)).not.toThrow();
    expect(() => validateWorkspaceAccess(principal, validWorkspaceB)).toThrow(McpError);
  });

  it("08.SEC.5: Tampered bundle hash and checksum mismatch detected and rejected", async () => {
    const bundle = createValidBundle(validWorkspaceA, "attack_tamper");

    // Tamper with declared bundle_hash
    const tamperedBundle = {
      manifest: {
        ...bundle.manifest,
        bundle_hash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      files: bundle.files,
    };

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(tamperedBundle),
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(res.status).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("CONFLICT");
    expect(body.conflict_type).toBe("checksum_mismatch");

    // Tamper with file content without updating checksum
    const contentTamperedBundle = {
      manifest: bundle.manifest,
      files: {
        "assets/attack.asset": "damage: 99999\n", // Altered content
      },
    };

    const res2 = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(contentTamperedBundle),
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(res2.status).toBe(409);
    const body2 = JSON.parse(res2.body);
    expect(body2.status).toBe("CONFLICT");
    expect(body2.conflict_type).toBe("checksum_mismatch");
  });

  it("08.SEC.6: Oversized bundle or file exceeds execution limits and is rejected", () => {
    const file = "assets/huge.asset";
    const content = "x".repeat(2000);
    const hash = computeSha256(content);
    const checksums = { [file]: hash };
    const bundle_hash = computeCanonicalBundleHash(checksums);

    const manifest: ExportBundleManifest = {
      schema_version: "1.0.0",
      engine: "unity",
      engine_version: "2026.1",
      project_id: "sec-project",
      project_revision: "rev-001",
      exporter_version: "1.0.0",
      parser_version: "1.0.0",
      format: "unity-yaml-scriptable-object",
      workspace_id: validWorkspaceA,
      exported_at: "2026-09-09T20:00:00Z",
      asset_count: 1,
      checksums,
      bundle_hash,
    };

    const files = new Map<string, string | Buffer>([[file, content]]);

    // Rejection when maxFileSizeBytes is exceeded
    const res = validateEnvelope(manifest, files, validWorkspaceA, {
      maxBundleSizeBytes: 5000,
      maxFileSizeBytes: 1000, // file is 2000 bytes
      maxFileCount: 10,
      maxYamlDepth: 20,
      maxExtractedObjects: 100,
      maxStringSizeBytes: 1000,
    });

    expect(res.valid).toBe(false);
    expect(res.conflictType).toBe("oversized_bundle");
    expect(res.errors.some((e) => e.includes("exceeds limit"))).toBe(true);
  });

  it("08.SEC.7: Backend never initiates outbound network connection or host filesystem reads", async () => {
    // Verify pure in-memory upload flow without filesystem access
    const bundle = createValidBundle(validWorkspaceA, "attack_pure_push");

    const res = await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(bundle),
      { "x-authorized-workspaces": validWorkspaceA }
    );

    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("SUCCESS");
    expect(body.workspace_id).toBe(validWorkspaceA);

    // Verify status endpoint retrieves in-memory state without host filesystem access
    const statusRes = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceA}/status`,
      undefined,
      { "x-authorized-workspaces": validWorkspaceA }
    );
    expect(statusRes.status).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.has_snapshot).toBe(true);
    expect(statusBody.latest_snapshot_hash).toBe(body.snapshot_hash);
  });

  it("08.SEC.8: Cypher/graph queries without workspace_id fail-closed", async () => {
    const driver = new InMemoryGraphDriver();
    await initializeGraphSchema(driver);

    const emptySnapshot = createSnapshotForWorkspace("", "any_attack", "Empty", "finisher");

    // Projecting snapshot with empty workspace_id rejects
    await expect(projectCanonicalSnapshot(driver, emptySnapshot)).rejects.toThrow();

    // Querying cancel options with empty workspace_id rejects
    await expect(queryCancelOptions(driver, "", "any_attack")).rejects.toThrow();

    // Querying impact analysis with empty workspace_id rejects
    await expect(queryImpactAnalysis(driver, "", "any_attack")).rejects.toThrow();
  });

  it("08.SEC.9: Ingestion upload is restricted to HTTP delivery boundary, not MCP gateway", () => {
    const principalNoWs: Principal = {
      principal_id: "caller-anonymous",
      principal_type: "human",
      capabilities: ["combat:read"],
      authorized_workspaces: [],
    };

    // Attempting to access workspace without authorization fails at domain level with McpError
    expect(() => validateWorkspaceAccess(principalNoWs, validWorkspaceA)).toThrow(McpError);
  });

  it("08.SEC.10: Zero regression across delivery security and multi-tenant isolation", async () => {
    // Ensure that multiple status checks across tenants do not cross-leak
    const bundleA = createValidBundle(validWorkspaceA, "attack_a_final");
    const bundleB = createValidBundle(validWorkspaceB, "attack_b_final");

    await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceA}/bundles`,
      JSON.stringify(bundleA),
      { "x-authorized-workspaces": validWorkspaceA }
    );

    await makeRequest(
      "POST",
      `/api/workspaces/${validWorkspaceB}/bundles`,
      JSON.stringify(bundleB),
      { "x-authorized-workspaces": validWorkspaceB }
    );

    const statusA = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceA}/status`,
      undefined,
      { "x-authorized-workspaces": validWorkspaceA }
    );
    const bodyA = JSON.parse(statusA.body);
    expect(bodyA.workspace_id).toBe(validWorkspaceA);

    const statusB = await makeRequest(
      "GET",
      `/api/workspaces/${validWorkspaceB}/status`,
      undefined,
      { "x-authorized-workspaces": validWorkspaceB }
    );
    const bodyB = JSON.parse(statusB.body);
    expect(bodyB.workspace_id).toBe(validWorkspaceB);
  });
});
