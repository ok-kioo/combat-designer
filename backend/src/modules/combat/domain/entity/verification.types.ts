import { z } from "zod";


/**
 * CheckStatus represents the evaluation status of an individual verification rule.
 */
export const CheckStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "BLOCKED",
  "INCONCLUSIVE",
  "BUDGET_EXCEEDED",
  "ERROR",
]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/**
 * VerificationProfileKind defines strictness levels for combat diagnostics.
 */
export const VerificationProfileKindSchema = z.enum([
  "strict",
  "fast",
  "research",
]);
export type VerificationProfileKind = z.infer<typeof VerificationProfileKindSchema>;

/**
 * VerificationProfile configuration parameters.
 */
export const VerificationProfileSchema = z.object({
  kind: VerificationProfileKindSchema,
  max_sustained_dps: z.number().int().nonnegative().default(150),
  max_burst_damage: z.number().int().nonnegative().default(250),
  dps_window_frames: z.number().int().positive().default(60),
  max_juggle_frames: z.number().int().nonnegative().default(90),
  min_reaction_window_frames: z.number().int().nonnegative().default(4),
  min_counterplay_window_frames: z.number().int().nonnegative().default(6),
  require_provenance: z.boolean().default(true),
  require_guard_integrity: z.boolean().default(true),
  require_cycle_analysis: z.boolean().default(true),
});
export type VerificationProfile = z.infer<typeof VerificationProfileSchema>;

/**
 * Bounded computational budget allocated to verification execution.
 */
export const VerificationBudgetSchema = z.object({
  max_events_to_analyze: z.number().int().positive().default(10000),
  max_states_explored: z.number().int().positive().default(10000),
  max_cycles_checked: z.number().int().positive().default(5000),
  max_verification_steps: z.number().int().positive().default(50000),
  max_evidence_items: z.number().int().positive().default(500),
});
export type VerificationBudget = z.infer<typeof VerificationBudgetSchema>;

/**
 * Verification budget execution tracking result.
 */
export const VerificationBudgetResultSchema = z.object({
  exhausted: z.boolean(),
  reason: z.string().nullable().optional(),
  events_analyzed: z.number().int().nonnegative(),
  states_explored: z.number().int().nonnegative(),
  cycles_checked: z.number().int().nonnegative(),
  steps_taken: z.number().int().nonnegative(),
  evidence_count: z.number().int().nonnegative(),
});
export type VerificationBudgetResult = z.infer<typeof VerificationBudgetResultSchema>;

/**
 * Canonical violation codes emitted by verification rules.
 */
export const ViolationCodeSchema = z.enum([
  "INFINITE_STUN_LOOP",
  "STUN_LOCK",
  "MAX_SUSTAINED_DPS",
  "MAX_BURST",
  "MAX_JUGGLE",
  "RESOURCE_SAFETY",
  "CANCEL_VALIDITY",
  "PROVENANCE_REQUIRED",
  "GUARD_INTEGRITY",
  "NO_COUNTERPLAY",
  "ZERO_RISK_ATTACK",
  "EXECUTION_BUDGET",
  "STALE_REVISION",
  "INVALID_SIMULATION",
]);
export type ViolationCode = z.infer<typeof ViolationCodeSchema>;

/**
 * Structured machine-readable fact proving a safety check or violation.
 */
export const EvidenceSchema = z.object({
  evidence_id: z.string().min(1),
  kind: z.string().min(1),
  severity: z.string().min(1),
  frame_start: z.number().int().nonnegative(),
  frame_end: z.number().int().nonnegative(),
  actor_ids: z.array(z.string()).default([]),
  attack_ids: z.array(z.string()).default([]),
  event_ids: z.array(z.number().int().nonnegative()).default([]),
  state_fingerprints: z.array(z.string()).default([]),
  simulation_state_hash: z.string(),
  threshold: z.number().int().nonnegative(),
  observed: z.number().int().nonnegative(),
  cycle_states: z.array(z.string()).default([]),
  stamina_cost_net: z.number().int(),
  observed_reaction_window_frames: z.number().int().nonnegative(),
  observed_dps: z.number().int().nonnegative(),
  observed_burst: z.number().int().nonnegative(),
  observed_juggle_frames: z.number().int().nonnegative(),
  guard_break_escape_options: z.number().int().nonnegative(),
  missing_provenance_fields: z.array(z.string()).default([]),
  details: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Result of an individual verification rule check.
 */
export const CheckResultSchema = z.object({
  rule_id: z.string().min(1),
  scenario_id: z.string().min(1),
  status: CheckStatusSchema,
  threshold: z.number().int().nonnegative(),
  observed: z.number().int().nonnegative(),
  expected: z.string(),
  violation_code: ViolationCodeSchema.nullable().optional(),
  evidence: EvidenceSchema.nullable().optional(),
  message: z.string(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;


/**
 * Request DTO submitted to the combat analysis port.
 */
export const VerificationRequestSchema = z.object({
  workspace_id: z.string().min(1, "workspace_id is strictly required"),
  project_id: z.string().min(1, "project_id is strictly required"),
  project_revision: z.string().min(1, "project_revision is strictly required"),
  canonical_snapshot_hash: z.string().min(1, "canonical_snapshot_hash is strictly required"),
  simulation_input_hash: z.string().min(1, "simulation_input_hash is strictly required"),
  simulation_input: z.record(z.string(), z.unknown()),
  verification_profile: VerificationProfileSchema,
  verification_budget: VerificationBudgetSchema.optional().default({}),
  rule_set_version: z.string().min(1, "rule_set_version is strictly required"),
  verifier_version: z.string().min(1, "verifier_version is strictly required"),
});
export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;
