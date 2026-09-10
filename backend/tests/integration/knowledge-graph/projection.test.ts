import { describe, it, expect, beforeEach } from "vitest";
import {
  DefaultGraphAdapter,
  InMemoryGraphDriver,
  GRAPH_SCHEMA_VERSION,
} from "../../../src/infrastructure/provider/knowledge-graph/index.js";
import type { CanonicalCombatSnapshot } from "@combat-designer/backend";

function createMockSnapshot(
  workspaceId = "ws-alpha",
  projectId = "hero-game",
  revision = "rev-01",
  hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
): CanonicalCombatSnapshot {
  return {
    workspace_id: workspaceId,
    project_id: projectId,
    project_revision: revision,
    snapshot_hash: hash,
    attacks: [
      {
        id: `unity:${projectId}:jab`,
        name: { name: "Jab", raw_label: "Jab", untrusted_text: true },
        startup_frames: 4,
        active_frames: 2,
        recovery_frames: 8,
        damage: 30,
        chip_damage: 0,
        guard_break_value: 5,
        hitstun_frames: 10,
        hitstop_frames: 2,
        blockstun_frames: 6,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [{ resource_type: "stamina", amount: 10, cost_frame: 0 }],
        hitboxes: [
          {
            id: "hb_jab",
            attack_id: `unity:${projectId}:jab`,
            hitbox_type: "strike",
            shape: { shape_type: "box" },
            active_window: { start: 4, end: 6 },
            damage_multiplier_permille: 1000,
            knockback_x: 20,
            knockback_y: 0,
            launch: false,
          },
        ],
        cancels: [
          {
            source_attack: `unity:${projectId}:jab`,
            target_action: `unity:${projectId}:straight`,
            window: { start: 5, end: 10 },
            condition: "on_hit",
          },
        ],
        tags: ["fast", "light"],
        provenance: {
          engine: "unity",
          project_revision: revision,
          source_path: "assets/jab.asset",
          asset_id: "jab",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
      {
        id: `unity:${projectId}:straight`,
        name: { name: "Straight Punch", raw_label: "Straight Punch", untrusted_text: true },
        startup_frames: 8,
        active_frames: 3,
        recovery_frames: 14,
        damage: 70,
        chip_damage: 10,
        guard_break_value: 15,
        hitstun_frames: 16,
        hitstop_frames: 4,
        blockstun_frames: 10,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [{ resource_type: "stamina", amount: 20, cost_frame: 0 }],
        hitboxes: [
          {
            id: "hb_straight",
            attack_id: `unity:${projectId}:straight`,
            hitbox_type: "strike",
            shape: { shape_type: "box" },
            active_window: { start: 8, end: 11 },
            damage_multiplier_permille: 1000,
            knockback_x: 80,
            knockback_y: 20,
            launch: true,
          },
        ],
        cancels: [],
        tags: ["heavy", "launcher"],
        provenance: {
          engine: "unity",
          project_revision: revision,
          source_path: "assets/straight.asset",
          asset_id: "straight",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
    ],
  };
}

describe("SPEC 03 — Projection, Idempotency & Stale Detection", () => {
  let driver: InMemoryGraphDriver;
  let adapter: DefaultGraphAdapter;

  beforeEach(() => {
    driver = new InMemoryGraphDriver();
    adapter = new DefaultGraphAdapter(driver);
  });

  it("03.T.1 valid snapshot → projection PASS", async () => {
    const snapshot = createMockSnapshot();
    const result = await adapter.projectSnapshot(snapshot);

    expect(result.success).toBe(true);
    expect(result.status).toBe("CURRENT");
    expect(result.attacks_projected).toBe(2);
    expect(result.hitboxes_projected).toBe(2);
    expect(result.cancels_projected).toBe(1);

    const status = await adapter.getProjectionStatus(
      snapshot.workspace_id,
      snapshot.project_id,
      snapshot.snapshot_hash
    );
    expect(status.state).toBe("CURRENT");
  });

  it("03.T.2 & 03.T.3 projection idempotency PASS: same snapshot twice → no duplicates", async () => {
    const snapshot = createMockSnapshot();

    // First projection
    await adapter.projectSnapshot(snapshot);
    const nodeCountAfterFirst = driver.getAllNodes().length;
    const relCountAfterFirst = driver.getAllRelationships().length;

    // Second projection of exact same snapshot
    await adapter.projectSnapshot(snapshot);
    const nodeCountAfterSecond = driver.getAllNodes().length;
    const relCountAfterSecond = driver.getAllRelationships().length;

    // Must be identical, no duplicate nodes or relationships!
    expect(nodeCountAfterSecond).toBe(nodeCountAfterFirst);
    expect(relCountAfterSecond).toBe(relCountAfterFirst);
  });

  it("03.T.9 stale snapshot detected when snapshot_hash differs", async () => {
    const snapshot = createMockSnapshot();
    await adapter.projectSnapshot(snapshot);

    // Caller checks status with a newer canonical snapshot hash that hasn't been projected yet
    const newHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const status = await adapter.getProjectionStatus(
      snapshot.workspace_id,
      snapshot.project_id,
      newHash
    );

    expect(status.state).toBe("STALE");
    expect(status.details).toContain("Snapshot hash mismatch");
  });

  it("03.T.10 revision mismatch detected when querying unknown project/workspace", async () => {
    const snapshot = createMockSnapshot();
    await adapter.projectSnapshot(snapshot);

    const status = await adapter.getProjectionStatus(
      "unknown-workspace",
      snapshot.project_id,
      snapshot.snapshot_hash
    );

    expect(status.state).toBe("NOT_FOUND");
  });

  it("03.T.11 unsupported graph schema drift → STALE", async () => {
    const snapshot = createMockSnapshot();
    await adapter.projectSnapshot(snapshot);

    // Simulate an older projected schema version in the graph
    const session = driver.session();
    await session.run(
      `MERGE (m:ProjectionMetadata {workspace_id: $workspace_id, project_id: $project_id})
       SET m.graph_schema_version = '0.9.0'`,
      {
        workspace_id: snapshot.workspace_id,
        project_id: snapshot.project_id,
      }
    );

    const status = await adapter.getProjectionStatus(
      snapshot.workspace_id,
      snapshot.project_id,
      snapshot.snapshot_hash
    );

    expect(status.state).toBe("STALE");
    expect(status.details).toContain("Graph schema drift");
  });

  it("03.T.15 projection failure not marked CURRENT (recorded as ERROR)", async () => {
    const snapshot = createMockSnapshot();

    // Force driver to throw on session run to simulate unexpected DB failure
    const faultyDriver = {
      session() {
        return {
          async run() {
            throw new Error("Simulated Neo4j database disk error during projection");
          },
          async close() {},
        };
      },
      async verifyConnectivity() {
        return true;
      },
      async close() {},
    };

    const faultyAdapter = new DefaultGraphAdapter(faultyDriver);
    const result = await faultyAdapter.projectSnapshot(snapshot);

    expect(result.success).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.error).toContain("Simulated Neo4j database disk error");
  });
});
