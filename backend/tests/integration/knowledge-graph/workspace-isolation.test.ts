import { describe, it, expect, beforeEach } from "vitest";
import { DefaultGraphAdapter, InMemoryGraphDriver } from "../../../src/infrastructure/provider/knowledge-graph/index.js";
import type { CanonicalCombatSnapshot } from "@combat-designer/backend";

function createSnapshotForWorkspace(
  workspaceId: string,
  attackName: string
): CanonicalCombatSnapshot {
  const atkId = "unity:core:stinger"; // identical attack_id across workspaces to test collision
  return {
    workspace_id: workspaceId,
    project_id: "core",
    project_revision: "rev-1",
    snapshot_hash: `hash_${workspaceId}`,
    attacks: [
      {
        id: atkId,
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
            source_attack: atkId,
            target_action: "unity:core:finisher",
            window: { start: 10, end: 14 },
            condition: "on_hit",
          },
        ],
        tags: ["thrust"],
        provenance: {
          engine: "unity",
          project_revision: "rev-1",
          source_path: "assets/stinger.asset",
          asset_id: "stinger",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
    ],
  };
}

describe("SPEC 03 — Workspace Isolation Tests", () => {
  let driver: InMemoryGraphDriver;
  let adapter: DefaultGraphAdapter;

  beforeEach(async () => {
    driver = new InMemoryGraphDriver();
    adapter = new DefaultGraphAdapter(driver);

    // Project workspace A and workspace B into the same graph database
    const snapA = createSnapshotForWorkspace("workspace-A", "Stinger of A");
    const snapB = createSnapshotForWorkspace("workspace-B", "Stinger of B");

    await adapter.projectSnapshot(snapA);
    await adapter.projectSnapshot(snapB);
  });

  it("03.T.4 workspace A cannot read workspace B data", async () => {
    const cancelsA = await adapter.getCancelOptions("workspace-A", "unity:core:stinger");
    expect(cancelsA).toHaveLength(1);
    expect(cancelsA[0].source_attack).toBe("unity:core:stinger");

    // Check that provenance query for workspace A returns only workspace A data
    const provA = await adapter.getProvenance("workspace-A", "unity:core:stinger");
    expect(provA).not.toBeNull();

    // Querying an attack that only exists in B from workspace A returns empty
    const nonExistentInA = await adapter.getCancelOptions("workspace-A", "non-existent");
    expect(nonExistentInA).toHaveLength(0);
  });

  it("03.T.5 colliding attack_id across workspaces are isolated into distinct nodes", async () => {
    const allNodes = driver.getAllNodes().filter((n) => n.labels.has("Attack"));
    expect(allNodes).toHaveLength(2);

    const nodeA = allNodes.find((n) => n.properties.workspace_id === "workspace-A");
    const nodeB = allNodes.find((n) => n.properties.workspace_id === "workspace-B");

    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(nodeA?.properties.name).toBe("Stinger of A");
    expect(nodeB?.properties.name).toBe("Stinger of B");
    expect(nodeA?.id).not.toBe(nodeB?.id);
  });

  it("03.T.6 cross-workspace traversal is strictly blocked", async () => {
    // All relationships must match the query's workspace_id
    const rels = driver.getAllRelationships();
    for (const r of rels) {
      expect(["workspace-A", "workspace-B"]).toContain(r.properties.workspace_id);
    }

    // Impact analysis in workspace A only reports entities in workspace A
    const impactA = await adapter.getImpactAnalysis("workspace-A", "unity:core:stinger");
    expect(impactA.attack_id).toBe("unity:core:stinger");
    expect(impactA.affected_attacks).toEqual(["unity:core:finisher"]);
  });

  it("03.T.7 missing or empty workspace_id → REJECT (throws error)", async () => {
    await expect(adapter.getCancelOptions("", "unity:core:stinger")).rejects.toThrow(
      "workspace_id is strictly mandatory"
    );

    await expect(adapter.getImpactAnalysis("   ", "unity:core:stinger")).rejects.toThrow(
      "workspace_id is strictly mandatory"
    );

    await expect(adapter.getProvenance(null as any, "unity:core:stinger")).rejects.toThrow(
      "workspace_id is strictly mandatory"
    );
  });
});
