import { z } from "zod";

export const ChangeSetStatusSchema = z.enum([
  "proposed",
  "simulated",
  "verified",
  "approved",
  "applied",
  "withdrawn",
  "rejected",
]);
export type ChangeSetStatus = z.infer<typeof ChangeSetStatusSchema>;

export const AttackDamageChangeSchema = z.object({
  type: z.literal("attack_damage"),
  attack_id: z.string().min(1),
  current_damage: z.number().int().nonnegative(),
  proposed_damage: z.number().int().nonnegative(),
  reason: z.string().min(1),
}).strict();

export const AttackRecoveryChangeSchema = z.object({
  type: z.literal("attack_recovery"),
  attack_id: z.string().min(1),
  current_recovery_frames: z.number().int().nonnegative(),
  proposed_recovery_frames: z.number().int().nonnegative(),
  reason: z.string().min(1),
}).strict();

export const CancelWindowChangeSchema = z.object({
  type: z.literal("cancel_window"),
  attack_id: z.string().min(1),
  target_attack_id: z.string().min(1),
  current_window: z.object({
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
  }).strict(),
  proposed_window: z.object({
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
  }).strict(),
  reason: z.string().min(1),
}).strict();

export const ResourceCostChangeSchema = z.object({
  type: z.literal("resource_cost"),
  attack_id: z.string().min(1),
  resource_name: z.string().min(1),
  current_cost: z.number().int().nonnegative(),
  proposed_cost: z.number().int().nonnegative(),
  reason: z.string().min(1),
}).strict();

export const HitboxChangeSchema = z.object({
  type: z.literal("hitbox"),
  attack_id: z.string().min(1),
  hitbox_id: z.string().min(1),
  current_active_frames: z.object({
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
  }).strict(),
  proposed_active_frames: z.object({
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
  }).strict(),
  reason: z.string().min(1),
}).strict();

export const ChangeSetMutationSchema = z.discriminatedUnion("type", [
  AttackDamageChangeSchema,
  AttackRecoveryChangeSchema,
  CancelWindowChangeSchema,
  ResourceCostChangeSchema,
  HitboxChangeSchema,
]);
export type ChangeSetMutation = z.infer<typeof ChangeSetMutationSchema>;

export const ChangeSetProposalSchema = z.object({
  changeset_id: z.string().min(1),
  workspace_id: z.string().min(1),
  base_revision: z.string().min(1),
  target_revision: z.string().min(1),
  proposed_by: z.string().min(1),
  status: ChangeSetStatusSchema,
  mutations: z.array(ChangeSetMutationSchema).min(1),
  simulation_id: z.string().optional(),
  simulation_hash: z.string().optional(),
  gate_run_id: z.string().optional(),
  gate_verdict: z.string().optional(),
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  applied_at: z.string().nullable().optional(),
  created_at: z.string().min(1),
  idempotency_key: z.string().optional(),
}).strict();

export type ChangeSetProposal = z.infer<typeof ChangeSetProposalSchema>;
