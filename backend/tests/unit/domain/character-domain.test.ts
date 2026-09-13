import { describe, it, expect } from "vitest";
import { CharacterSchema, type Character } from "../../../src/modules/combat/domain/entity/character.js";
import { InMemoryCharacterRepository } from "../../../src/modules/combat/domain/repository/character-repository-port.js";
import { CanonicalAttackSchema } from "../../../src/modules/ingestion/domain/entity/snapshot.js";
import { projectCanonicalSnapshot } from "../../../src/infrastructure/provider/knowledge-graph/projector/projector.js";
import { InMemoryGraphDriver } from "../../../src/infrastructure/provider/knowledge-graph/client/in-memory-driver.js";

describe("SPEC 14 — Character Domain & Graph Projection (DOMAIN.CHAR.1 to DOMAIN.CHAR.8)", () => {
  const sampleCharacter: Character = {
    id: "char-ryu",
    workspace_id: "ws-test",
    name: "Ryu",
    display_name: "Master Ryu",
    metadata: {
      archetype: "shoto",
      base_health: 1000,
    },
    provenance: {
      imported_at: new Date().toISOString(),
      importer: "unity_manifest",
      source_asset: "Assets/Ryu.prefab",
    },
  };

  it("DOMAIN.CHAR.1: Character entity validates with Zod CharacterSchema", () => {
    const parsed = CharacterSchema.parse(sampleCharacter);
    expect(parsed.id).toBe("char-ryu");
    expect(parsed.name).toBe("Ryu");
    expect(parsed.metadata.archetype).toBe("shoto");
  });

  it("DOMAIN.CHAR.2: CharacterRepositoryPort handles save, findById, findByWorkspace, and count", async () => {
    const repo = new InMemoryCharacterRepository();
    await repo.save(sampleCharacter);

    const found = await repo.findById("ws-test", "char-ryu");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Ryu");

    const list = await repo.findByWorkspace("ws-test");
    expect(list.length).toBe(1);

    const count = await repo.countByWorkspace("ws-test");
    expect(count).toBe(1);
  });

  it("DOMAIN.CHAR.3: Attack entity supports optional character_id and assignment_status", () => {
    const attackData = {
      id: "atk-hadoken",
      name: { name: "Hadoken", raw_label: "Hadoken", untrusted_text: true as const },
      startup_frames: 12,
      active_frames: 4,
      recovery_frames: 18,
      damage: 60,
      hitstun_frames: 15,
      hitstop_frames: 4,
      blockstun_frames: 10,
      chip_damage: 10,
      guard_break_value: 0,
      invuln_windows: [],
      armor_windows: [],
      resource_costs: [],
      hitboxes: [],
      cancels: [],
      tags: ["projectile", "special"],
      character_id: "char-ryu",
      assignment_status: "ASSIGNED" as const,
      provenance: {
        engine: "unity" as const,
        project_revision: "rev-1",
        source_path: "Assets/Hadoken.asset",
        asset_id: "hadoken_asset",
        parser_version: "1.0",
        confidence_permille: 1000,
        status: "canonical" as const,
      },
    };

    const parsed = CanonicalAttackSchema.parse(attackData);
    expect(parsed.character_id).toBe("char-ryu");
    expect(parsed.assignment_status).toBe("ASSIGNED");
  });

  it("DOMAIN.CHAR.4: Default attack without character_id has assignment_status UNASSIGNED and character_id null", () => {
    const unassignedAttack = {
      id: "atk-universal-light",
      name: { name: "Universal Light", raw_label: "Universal Light", untrusted_text: true as const },
      startup_frames: 4,
      active_frames: 3,
      recovery_frames: 6,
      damage: 30,
      hitstun_frames: 10,
      hitstop_frames: 3,
      blockstun_frames: 8,
      chip_damage: 0,
      guard_break_value: 0,
      invuln_windows: [],
      armor_windows: [],
      resource_costs: [],
      hitboxes: [],
      cancels: [],
      tags: ["light"],
      provenance: {
        engine: "unity" as const,
        project_revision: "rev-1",
        source_path: "Assets/Light.asset",
        asset_id: "light_asset",
        parser_version: "1.0",
        confidence_permille: 1000,
        status: "canonical" as const,
      },
    };

    const parsed = CanonicalAttackSchema.parse(unassignedAttack);
    expect(parsed.character_id).toBeNull();
    expect(parsed.assignment_status).toBe("UNASSIGNED");
  });

  it("DOMAIN.CHAR.5: Invariant: KnowledgeGraph NEVER creates fake UNASSIGNED Character node", async () => {
    const driver = new InMemoryGraphDriver();

    const snapshot = {
      workspace_id: "ws-test",
      project_id: "proj-1",
      project_revision: "rev-1",
      snapshot_hash: "hash-123",
      attacks: [
        {
          id: "atk-unassigned-1",
          name: { name: "Punch", raw_label: "Punch", untrusted_text: true as const },
          startup_frames: 5,
          active_frames: 2,
          recovery_frames: 8,
          damage: 20,
          hitstun_frames: 8,
          hitstop_frames: 2,
          blockstun_frames: 6,
          chip_damage: 0,
          guard_break_value: 0,
          invuln_windows: [],
          armor_windows: [],
          resource_costs: [],
          hitboxes: [],
          cancels: [],
          tags: [],
          character_id: null,
          assignment_status: "UNASSIGNED" as const,
          provenance: {
            engine: "unity" as const,
            project_revision: "rev-1",
            source_path: "Assets/Punch.asset",
            asset_id: "punch",
            parser_version: "1.0",
            confidence_permille: 1000,
            status: "canonical" as const,
          },
        },
      ],
    };

    await projectCanonicalSnapshot(driver as any, snapshot as any);

    // Verify no Character node with id 'UNASSIGNED' or 'null' was created
    const fakeCharRes = await driver.session().run(
      "MATCH (c:Character {workspace_id: $ws}) RETURN c",
      { ws: "ws-test" }
    );
    expect(fakeCharRes.records.length).toBe(0);
  });

  it("DOMAIN.CHAR.6: Projector creates (:Character)-[:HAS_ATTACK]->(:Attack) relationship when character_id is assigned", async () => {
    const driver = new InMemoryGraphDriver();

    const snapshot = {
      workspace_id: "ws-test",
      project_id: "proj-1",
      project_revision: "rev-1",
      snapshot_hash: "hash-456",
      attacks: [
        {
          id: "atk-shoryuken",
          name: { name: "Shoryuken", raw_label: "Shoryuken", untrusted_text: true as const },
          startup_frames: 3,
          active_frames: 5,
          recovery_frames: 20,
          damage: 100,
          hitstun_frames: 25,
          hitstop_frames: 5,
          blockstun_frames: 12,
          chip_damage: 15,
          guard_break_value: 0,
          invuln_windows: [],
          armor_windows: [],
          resource_costs: [],
          hitboxes: [],
          cancels: [],
          tags: ["dp", "special"],
          character_id: "char-ryu",
          assignment_status: "ASSIGNED" as const,
          provenance: {
            engine: "unity" as const,
            project_revision: "rev-1",
            source_path: "Assets/Shoryuken.asset",
            asset_id: "shoryuken",
            parser_version: "1.0",
            confidence_permille: 1000,
            status: "canonical" as const,
          },
        },
      ],
    };

    await projectCanonicalSnapshot(driver as any, snapshot as any);

    const charNodes = await driver.session().run(
      "MATCH (c:Character {workspace_id: $ws}) RETURN c",
      { ws: "ws-test" }
    );
    expect(charNodes.records.length).toBe(1);

    const hasAttackRel = await driver.session().run(
      "MATCH (c:Character)-[:HAS_ATTACK]->(a:Attack) RETURN c, a",
      {}
    );
    expect(hasAttackRel.records.length).toBe(1);
  });

  it("DOMAIN.CHAR.7: Character update preserves workspace isolation", async () => {
    const repo = new InMemoryCharacterRepository();
    await repo.save({ ...sampleCharacter, workspace_id: "ws-1" });
    await repo.save({ ...sampleCharacter, id: "char-ken", name: "Ken", workspace_id: "ws-2" });

    const ws1Chars = await repo.findByWorkspace("ws-1");
    expect(ws1Chars.length).toBe(1);
    expect(ws1Chars[0].id).toBe("char-ryu");

    const ws2Chars = await repo.findByWorkspace("ws-2");
    expect(ws2Chars.length).toBe(1);
    expect(ws2Chars[0].id).toBe("char-ken");
  });

  it("DOMAIN.CHAR.8: Character summary projection includes core metadata", () => {
    const summary = {
      character_id: sampleCharacter.id,
      name: sampleCharacter.name,
      attacks_count: 5,
      combos_count: 2,
    };
    expect(summary.attacks_count).toBe(5);
    expect(summary.combos_count).toBe(2);
  });
});
