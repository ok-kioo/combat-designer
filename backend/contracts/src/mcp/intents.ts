import { z } from "zod";
import { ChangeSetMutationSchema } from "./changeset.js";

export const SearchIntentSchema = z.object({
  type: z.literal("search"),
  workspace_id: z.string().min(1),
  query: z.string().optional(),
  tag: z.string().optional(),
  min_cancel_window: z.number().int().nonnegative().optional(),
}).strict();
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

export const SimulationIntentSchema = z.object({
  type: z.literal("simulate"),
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  scenario_id: z.string().min(1),
  max_frames: z.number().int().positive().max(3600).default(600),
}).strict();
export type SimulationIntent = z.infer<typeof SimulationIntentSchema>;

export const VerificationIntentSchema = z.object({
  type: z.literal("verify"),
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  project_revision: z.string().min(1),
  canonical_snapshot_hash: z.string().min(1),
  simulation_input_hash: z.string().min(1),
  profile: z.enum(["strict", "fast", "research"]).default("strict"),
}).strict();
export type VerificationIntent = z.infer<typeof VerificationIntentSchema>;

export const ChangeProposalIntentSchema = z.object({
  type: z.literal("propose"),
  workspace_id: z.string().min(1),
  base_revision: z.string().min(1),
  target_revision: z.string().min(1),
  mutations: z.array(ChangeSetMutationSchema).min(1),
  reason: z.string().min(1),
  expected_effect: z.string().min(1),
  idempotency_key: z.string().optional(),
}).strict();
export type ChangeProposalIntent = z.infer<typeof ChangeProposalIntentSchema>;

export const ApprovalIntentSchema = z.object({
  type: z.literal("approve"),
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
  human_approver_id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
}).strict();
export type ApprovalIntent = z.infer<typeof ApprovalIntentSchema>;

export const CombatIntentSchema = z.discriminatedUnion("type", [
  SearchIntentSchema,
  SimulationIntentSchema,
  VerificationIntentSchema,
  ChangeProposalIntentSchema,
  ApprovalIntentSchema,
]);
export type CombatIntent = z.infer<typeof CombatIntentSchema>;
