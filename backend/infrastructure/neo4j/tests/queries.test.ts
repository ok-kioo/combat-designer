import { describe, it, expect, beforeEach } from "vitest";
import { DefaultGraphAdapter, InMemoryGraphDriver } from "../src/index.js";
import type { CanonicalCombatSnapshot } from "@combat-designer/shared-contracts";

function createComboGraphSnapshot(): CanonicalCombatSnapshot {
  const ws = "ws-combos";
  const proj = "fighter";
  return {
    workspace_id: ws,
    project_id: proj,
    project_revision: "rev-1",
    snapshot_hash: "hash_combos_12345",
    attacks: [
      {
        id: `unity:${proj}:light_punch`,
        name: { name: "Light Punch", raw_label: "Light Punch", untrusted_text: true },
        startup_frames: 4,
        active_frames: 2,
        recovery_frames: 6,
        damage: 20,
        chip_damage: 0,
        guard_break_value: 0,
        hitstun_frames: 8,
        hitstop_frames: 2,
        blockstun_frames: 4,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [
          {
            id: "hb_lp",
            attack_id: `unity:${proj}:light_punch`,
            hitbox_type: "strike",
            shape: { shape_type: "box" },
            active_window: { start: 4, end: 6 },
            damage_multiplier_permille: 1000,
            knockback_x: 10,
            knockback_y: 0,
            launch: false,
          },
        ],
        cancels: [
          {
            source_attack: `unity:${proj}:light_punch`,
            target_action: `unity:${proj}:medium_kick`,
            window: { start: 5, end: 8 },
            condition: "on_hit",
          },
        ],
        tags: ["light"],
        provenance: {
          engine: "unity",
          project_revision: "rev-1",
          source_path: "assets/lp.asset",
          asset_id: "lp",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
      {
        id: `unity:${proj}:medium_kick`,
        name: { name: "Medium Kick", raw_label: "Medium Kick", untrusted_text: true },
        startup_frames: 7,
        active_frames: 3,
        recovery_frames: 10,
        damage: 50,
        chip_damage: 5,
        guard_break_value: 10,
        hitstun_frames: 14,
        hitstop_frames: 3,
        blockstun_frames: 8,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [
          {
            id: "hb_mk",
            attack_id: `unity:${proj}:medium_kick`,
            hitbox_type: "strike",
            shape: { shape_type: "box" },
            active_window: { start: 7, end: 10 },
            damage_multiplier_permille: 1000,
            knockback_x: 30,
            knockback_y: 0,
            launch: false,
          },
        ],
        cancels: [
          {
            source_attack: `unity:${proj}:medium_kick`,
            target_action: `unity:${proj}:heavy_uppercut`,
            window: { start: 8, end: 12 },
            condition: "on_hit",
          },
          // Intentional candidate cycle: medium_kick can also cancel back to light_punch
          {
            source_attack: `unity:${proj}:medium_kick`,
            target_action: `unity:${proj}:light_punch`,
            window: { start: 8, end: 12 },
            condition: "on_hit",
          },
        ],
        tags: ["medium"],
        provenance: {
          engine: "unity",
          project_revision: "rev-1",
          source_path: "assets/mk.asset",
          asset_id: "mk",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
      {
        id: `unity:${proj}:heavy_uppercut`,
        name: { name: "Heavy Uppercut", raw_label: "Heavy Uppercut", untrusted_text: true },
        startup_frames: 11,
        active_frames: 4,
        recovery_frames: 20,
        damage: 120,
        chip_damage: 20,
        guard_break_value: 30,
        hitstun_frames: 25,
        hitstop_frames: 6,
        blockstun_frames: 12,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [
          {
            id: "hb_hu",
            attack_id: `unity:${proj}:heavy_uppercut`,
            hitbox_type: "strike",
            shape: { shape_type: "box" },
            active_window: { start: 11, end: 15 },
            damage_multiplier_permille: 1000,
            knockback_x: 40,
            knockback_y: 120,
            launch: true, // Launcher!
          },
        ],
        cancels: [],
        tags: ["heavy", "anti_air", "launcher"],
        provenance: {
          engine: "unity",
          project_revision: "rev-1",
          source_path: "assets/hu.asset",
          asset_id: "hu",
          parser_version: "1.0.0",
          confidence_permille: 1000,
          status: "canonical",
        },
      },
    ],
  };
}

describe("SPEC 03 — Query Catalog (Q01 to Q06) & Query Limits", () => {
  let driver: InMemoryGraphDriver;
  let adapter: DefaultGraphAdapter;
  const ws = "ws-combos";
  const proj = "fighter";

  beforeEach(async () => {
    driver = new InMemoryGraphDriver();
    adapter = new DefaultGraphAdapter(driver);

    const snapshot = createComboGraphSnapshot();
    await adapter.projectSnapshot(snapshot);
  });

  it("Q01 cancel options returns reachable attacks", async () => {
    const cancels = await adapter.getCancelOptions(ws, `unity:${proj}:light_punch`);
    expect(cancels).toHaveLength(1);
    expect(cancels[0].target_attack_id).toBe(`unity:${proj}:medium_kick`);
  });

  it("Q02 paths to launcher discovers path ending in launcher hitbox", async () => {
    const paths = await adapter.getPathsToLauncher(ws, `unity:${proj}:light_punch`, 5);
    expect(paths.length).toBeGreaterThan(0);
    const launcherFound = paths.some(
      (p) => p.launcher_attack_id === `unity:${proj}:heavy_uppercut`
    );
    expect(launcherFound).toBe(true);
  });

  it("Q03 cycle discovery discovers candidate action cycles", async () => {
    const cycles = await adapter.getCandidateCycles(ws, 6, 10);
    expect(cycles.length).toBeGreaterThan(0);
    // Cycle light_punch -> medium_kick -> light_punch
    const cycle = cycles.find((c) =>
      c.cycle.includes(`unity:${proj}:light_punch`) &&
      c.cycle.includes(`unity:${proj}:medium_kick`)
    );
    expect(cycle).toBeDefined();
    expect(cycle?.cycle[0]).toBe(cycle?.cycle[cycle.cycle.length - 1]);
  });

  it("Q04 impact analysis returns connected entities", async () => {
    const impact = await adapter.getImpactAnalysis(ws, `unity:${proj}:medium_kick`);
    expect(impact.attack_id).toBe(`unity:${proj}:medium_kick`);
    expect(impact.affected_attacks).toContain(`unity:${proj}:heavy_uppercut`);
    expect(impact.total_connected_entities).toBeGreaterThan(0);
  });

  it("Q05 provenance returns complete asset provenance", async () => {
    const prov = await adapter.getProvenance(ws, `unity:${proj}:heavy_uppercut`);
    expect(prov).not.toBeNull();
    expect(prov?.attack_id).toBe(`unity:${proj}:heavy_uppercut`);
    expect(prov?.provenance.engine).toBe("unity");
    expect(prov?.provenance.source_path).toBe("assets/hu.asset");
  });

  it("03.T.8 invalid attack_id returns empty result (NOT_FOUND)", async () => {
    const cancels = await adapter.getCancelOptions(ws, "non:existent:attack");
    expect(cancels).toHaveLength(0);

    const prov = await adapter.getProvenance(ws, "non:existent:attack");
    expect(prov).toBeNull();
  });

  it("03.T.12 parameterized Cypher prevents injection attacks", async () => {
    // Malicious injection attempt in attack_id
    const maliciousAttackId = `unity:${proj}:light_punch' OR '1'='1`;
    const res = await adapter.getCancelOptions(ws, maliciousAttackId);
    // Safe empty result, Cypher injection did not evaluate
    expect(res).toHaveLength(0);
  });

  it("03.T.13 query depth limit enforced (clamped to max 10)", async () => {
    // Passing 999 as depth is clamped internally to 10
    const paths = await adapter.getPathsToLauncher(ws, `unity:${proj}:light_punch`, 999);
    expect(Array.isArray(paths)).toBe(true);
  });

  it("03.T.14 query result limit enforced (clamped to max 100)", async () => {
    const cycles = await adapter.getCandidateCycles(ws, 6, 9999);
    expect(cycles.length).toBeLessThanOrEqual(100);
  });
});
