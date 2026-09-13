import { z } from "zod";
import { QuarantineRecordSchema } from "./quarantine.js";
import { ConflictRecordSchema } from "./conflict.js";

export const CanonicalFrameWindowSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const CanonicalResourceCostSchema = z.object({
  resource_type: z.string().min(1),
  amount: z.number().int().nonnegative(),
  cost_frame: z.number().int().nonnegative(),
});

export const CanonicalHitboxSchema = z.object({
  id: z.string().min(1),
  attack_id: z.string().min(1),
  hitbox_type: z.enum(["strike", "throw", "projectile", "counter"]),
  shape: z.object({
    shape_type: z.string(),
  }).passthrough(),
  active_window: CanonicalFrameWindowSchema,
  damage_multiplier_permille: z.number().int().nonnegative(),
  knockback_x: z.number().int(),
  knockback_y: z.number().int(),
  launch: z.boolean(),
});

export const CanonicalCancelRuleSchema = z.object({
  source_attack: z.string().min(1),
  target_action: z.string().min(1),
  window: CanonicalFrameWindowSchema,
  condition: z.enum(["on_hit", "on_block", "on_whiff", "always"]),
  resource_cost: CanonicalResourceCostSchema.nullable().optional(),
});

export const CanonicalProvenanceSchema = z.object({
  engine: z.string().min(1),
  project_revision: z.string().min(1),
  source_path: z.string().min(1),
  asset_id: z.string().min(1),
  parser_version: z.string().min(1),
  confidence_permille: z.number().int().min(0).max(1000),
  status: z.union([
    z.literal("canonical"),
    z.literal("derived"),
    z.object({ quarantined: z.object({ reason: z.string() }) }),
  ]),
});

export const CanonicalAttackSchema = z.object({
  id: z.string().min(1),
  name: z.object({
    name: z.string().min(1),
    raw_label: z.string().min(1),
    untrusted_text: z.literal(true),
  }),
  startup_frames: z.number().int().nonnegative(),
  active_frames: z.number().int().positive("active_frames must be > 0"),
  recovery_frames: z.number().int().nonnegative(),
  damage: z.number().int().nonnegative(),
  hitstun_frames: z.number().int().nonnegative(),
  hitstop_frames: z.number().int().nonnegative(),
  blockstun_frames: z.number().int().nonnegative(),
  chip_damage: z.number().int().nonnegative(),
  guard_break_value: z.number().int().nonnegative(),
  invuln_windows: z.array(CanonicalFrameWindowSchema).default([]),
  armor_windows: z.array(CanonicalFrameWindowSchema).default([]),
  resource_costs: z.array(CanonicalResourceCostSchema).default([]),
  hitboxes: z.array(CanonicalHitboxSchema).default([]),
  cancels: z.array(CanonicalCancelRuleSchema).default([]),
  tags: z.array(z.string()).default([]),
  character_id: z.string().nullable().default(null),
  assignment_status: z.enum(["ASSIGNED", "UNASSIGNED"]).default("UNASSIGNED"),
  provenance: CanonicalProvenanceSchema,
});

export type CanonicalAttack = z.infer<typeof CanonicalAttackSchema>;

export const CanonicalCombatSnapshotSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  project_revision: z.string().min(1),
  attacks: z.array(CanonicalAttackSchema),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/i),
});

export type CanonicalCombatSnapshot = z.infer<typeof CanonicalCombatSnapshotSchema>;

export const CanonicalSnapshotEnvelopeSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  revision: z.string().min(1),
  snapshot_id: z.string().min(1),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  parser_version: z.string().min(1),
  schema_version: z.string().min(1),
  canonical_snapshot: CanonicalCombatSnapshotSchema,
  quarantined: z.array(QuarantineRecordSchema).default([]),
  conflicts: z.array(ConflictRecordSchema).default([]),
  created_at: z.string().min(1),
});

export type CanonicalSnapshotEnvelope = z.infer<typeof CanonicalSnapshotEnvelopeSchema>;
