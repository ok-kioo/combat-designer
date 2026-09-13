import type { CanonicalCombatSnapshot } from "@combat-designer/backend";
import type { GraphDriver } from "../client/driver.js";
import {
  GRAPH_SCHEMA_VERSION,
  PROJECTOR_VERSION,
  GRAPH_CONSTRAINTS,
  GRAPH_INDEXES,
} from "../schema/schema.js";

export interface ProjectorOptions {
  snapshot_id?: string;
  force?: boolean;
}

export interface ProjectionSummary {
  success: boolean;
  workspace_id: string;
  project_id: string;
  revision: string;
  snapshot_hash: string;
  attacks_projected: number;
  hitboxes_projected: number;
  cancels_projected: number;
  status: "CURRENT" | "ERROR";
  error?: string;
}

export async function initializeGraphSchema(driver: GraphDriver): Promise<void> {
  const session = driver.session();
  try {
    for (const ddl of GRAPH_CONSTRAINTS) {
      await session.run(ddl);
    }
    for (const idx of GRAPH_INDEXES) {
      await session.run(idx);
    }
  } finally {
    await session.close();
  }
}

export async function projectCanonicalSnapshot(
  driver: GraphDriver,
  snapshot: CanonicalCombatSnapshot,
  options: ProjectorOptions = {}
): Promise<ProjectionSummary> {
  if (!snapshot || !snapshot.workspace_id || typeof snapshot.workspace_id !== "string" || snapshot.workspace_id.trim() === "") {
    throw new Error("Invalid projection: workspace_id is strictly mandatory for graph projection.");
  }
  const session = driver.session();
  const snapshotId = options.snapshot_id || `snap_${snapshot.project_id}_${snapshot.snapshot_hash.slice(0, 16)}`;
  let attacksProjected = 0;
  let hitboxesProjected = 0;
  let cancelsProjected = 0;

  try {
    // 1. Project each Attack using idempotent MERGE
    for (const atk of snapshot.attacks) {
      attacksProjected++;
      hitboxesProjected += atk.hitboxes.length;
      cancelsProjected += atk.cancels.length;

      const mergeAttackQuery = `
        MERGE (a:Attack {workspace_id: $workspace_id, attack_id: $attack_id})
        ON CREATE SET
          a.name = $name,
          a.raw_label = $raw_label,
          a.untrusted_text = $untrusted_text,
          a.startup_frames = $startup_frames,
          a.active_frames = $active_frames,
          a.recovery_frames = $recovery_frames,
          a.total_duration = $total_duration,
          a.damage = $damage,
          a.chip_damage = $chip_damage,
          a.guard_break_value = $guard_break_value,
          a.hitstun_frames = $hitstun_frames,
          a.hitstop_frames = $hitstop_frames,
          a.blockstun_frames = $blockstun_frames,
          a.tags = $tags,
          a.project_id = $project_id,
          a.project_revision = $project_revision,
          a.engine = $engine
        ON MATCH SET
          a.name = $name,
          a.raw_label = $raw_label,
          a.untrusted_text = $untrusted_text,
          a.startup_frames = $startup_frames,
          a.active_frames = $active_frames,
          a.recovery_frames = $recovery_frames,
          a.total_duration = $total_duration,
          a.damage = $damage,
          a.chip_damage = $chip_damage,
          a.guard_break_value = $guard_break_value,
          a.hitstun_frames = $hitstun_frames,
          a.hitstop_frames = $hitstop_frames,
          a.blockstun_frames = $blockstun_frames,
          a.tags = $tags,
          a.project_id = $project_id,
          a.project_revision = $project_revision,
          a.engine = $engine
        RETURN a
      `;

      await session.run(mergeAttackQuery, {
        workspace_id: snapshot.workspace_id,
        attack_id: atk.id,
        name: atk.name.name,
        raw_label: atk.name.raw_label,
        untrusted_text: atk.name.untrusted_text,
        startup_frames: atk.startup_frames,
        active_frames: atk.active_frames,
        recovery_frames: atk.recovery_frames,
        total_duration: atk.startup_frames + atk.active_frames + atk.recovery_frames,
        damage: atk.damage,
        chip_damage: atk.chip_damage,
        guard_break_value: atk.guard_break_value,
        hitstun_frames: atk.hitstun_frames,
        hitstop_frames: atk.hitstop_frames,
        blockstun_frames: atk.blockstun_frames,
        tags: atk.tags,
        project_id: snapshot.project_id,
        project_revision: snapshot.project_revision,
        engine: atk.provenance.engine,
        hitboxes: atk.hitboxes,
        cancels: atk.cancels,
        resource_costs: atk.resource_costs,
        provenance: atk.provenance,
      });

      // 1b. Project Character and HAS_ATTACK relation only if assigned (never project fake UNASSIGNED node)
      if (atk.character_id && atk.assignment_status === "ASSIGNED") {
        const mergeCharQuery = `
          MERGE (c:Character {workspace_id: $workspace_id, character_id: $character_id})
          ON CREATE SET c.name = $character_name
          MERGE (c)-[:HAS_ATTACK {workspace_id: $workspace_id}]->(a:Attack {workspace_id: $workspace_id, attack_id: $attack_id})
        `;
        await session.run(mergeCharQuery, {
          workspace_id: snapshot.workspace_id,
          character_id: atk.character_id,
          character_name: atk.character_id,
          attack_id: atk.id,
        });
      }
    }

    // 2. Finalize: Set ProjectionMetadata status to CURRENT
    const now = new Date().toISOString();
    const mergeMetaQuery = `
      MERGE (m:ProjectionMetadata {workspace_id: $workspace_id, project_id: $project_id})
      ON CREATE SET
        m.revision = $revision,
        m.snapshot_id = $snapshot_id,
        m.snapshot_hash = $snapshot_hash,
        m.graph_schema_version = $graph_schema_version,
        m.projector_version = $projector_version,
        m.status = 'CURRENT',
        m.projected_at = $projected_at
      ON MATCH SET
        m.revision = $revision,
        m.snapshot_id = $snapshot_id,
        m.snapshot_hash = $snapshot_hash,
        m.graph_schema_version = $graph_schema_version,
        m.projector_version = $projector_version,
        m.status = 'CURRENT',
        m.projected_at = $projected_at
      RETURN m
    `;

    await session.run(mergeMetaQuery, {
      workspace_id: snapshot.workspace_id,
      project_id: snapshot.project_id,
      revision: snapshot.project_revision,
      snapshot_id: snapshotId,
      snapshot_hash: snapshot.snapshot_hash,
      graph_schema_version: GRAPH_SCHEMA_VERSION,
      projector_version: PROJECTOR_VERSION,
      projected_at: now,
    });

    return {
      success: true,
      workspace_id: snapshot.workspace_id,
      project_id: snapshot.project_id,
      revision: snapshot.project_revision,
      snapshot_hash: snapshot.snapshot_hash,
      attacks_projected: attacksProjected,
      hitboxes_projected: hitboxesProjected,
      cancels_projected: cancelsProjected,
      status: "CURRENT",
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Record ERROR status in metadata to prevent partial projection from being treated as CURRENT
    try {
      await session.run(
        `MERGE (m:ProjectionMetadata {workspace_id: $workspace_id, project_id: $project_id})
         SET m.status = 'ERROR'`,
        {
          workspace_id: snapshot.workspace_id,
          project_id: snapshot.project_id,
        }
      );
    } catch {
      // Ignore metadata write error on failure
    }

    return {
      success: false,
      workspace_id: snapshot.workspace_id,
      project_id: snapshot.project_id,
      revision: snapshot.project_revision,
      snapshot_hash: snapshot.snapshot_hash,
      attacks_projected: 0,
      hitboxes_projected: 0,
      cancels_projected: 0,
      status: "ERROR",
      error: errorMsg,
    };
  } finally {
    await session.close();
  }
}
