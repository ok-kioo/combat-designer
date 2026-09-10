import { z } from "zod";
import { ChangeSetMutationSchema } from "./changeset.js";

export const TOOL_ALIASES: Record<string, string> = {
  query_combat: "combat_search",
  simulate_changeset: "combat_simulate",
  run_gate: "combat_verify",
  explain_gate: "combat_explain_gate",
  propose_changeset: "combat_propose_change",
  withdraw_changeset: "combat_withdraw_change",
  apply_changeset: "combat_apply_change",
};

export function resolveCanonicalToolName(toolName: string): string {
  return TOOL_ALIASES[toolName] ?? toolName;
}

export const CanonicalToolNameSchema = z.enum([
  "combat_search",
  "combat_get_attack",
  "list_scenarios",
  "impact_analysis",
  "combat_simulate",
  "combat_verify",
  "combat_explain_gate",
  "combat_propose_change",
  "combat_get_change",
  "combat_withdraw_change",
  "combat_apply_change",
]);
export type CanonicalToolName = z.infer<typeof CanonicalToolNameSchema>;

// Tool 1: combat_search
export const CombatSearchInputSchema = z.object({
  workspace_id: z.string().min(1),
  query: z.string().optional(),
  tag: z.string().optional(),
  min_cancel_window: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();
export type CombatSearchInput = z.infer<typeof CombatSearchInputSchema>;

// Tool 2: combat_get_attack
export const CombatGetAttackInputSchema = z.object({
  workspace_id: z.string().min(1),
  attack_id: z.string().min(1),
}).strict();
export type CombatGetAttackInput = z.infer<typeof CombatGetAttackInputSchema>;

// Tool 3: list_scenarios
export const ListScenariosInputSchema = z.object({
  workspace_id: z.string().min(1),
}).strict();
export type ListScenariosInput = z.infer<typeof ListScenariosInputSchema>;

// Tool 4: impact_analysis
export const ImpactAnalysisInputSchema = z.object({
  workspace_id: z.string().min(1),
  attack_id: z.string().min(1),
}).strict();
export type ImpactAnalysisInput = z.infer<typeof ImpactAnalysisInputSchema>;

// Tool 5: combat_simulate
export const CombatSimulateInputSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  scenario: z.object({
    scenario_id: z.string().min(1),
    actors: z.array(z.record(z.unknown())).min(1),
  }).passthrough(),
  config: z.object({
    budget: z.object({
      max_frames: z.number().int().positive().max(3600),
      max_events: z.number().int().positive().max(5000),
      max_transitions: z.number().int().positive().max(5000),
    }).strict(),
    time_dilation: z.number().optional(),
  }).strict(),
}).strict();
export type CombatSimulateInput = z.infer<typeof CombatSimulateInputSchema>;

// Tool 6: combat_verify
export const CombatVerifyInputSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  project_revision: z.string().min(1),
  canonical_snapshot_hash: z.string().min(1),
  simulation_input_hash: z.string().min(1),
  simulation_input: z.record(z.unknown()),
  verification_profile: z.enum(["strict", "fast", "research"]).default("strict"),
  verification_budget: z.object({
    max_events: z.number().int().positive().max(10000).default(1000),
    max_states: z.number().int().positive().max(10000).default(1000),
    max_cycles: z.number().int().positive().max(1000).default(100),
    max_steps: z.number().int().positive().max(20000).default(5000),
  }).default({ max_events: 1000, max_states: 1000, max_cycles: 100, max_steps: 5000 }),
  rule_set_version: z.string().min(1),
  verifier_version: z.string().min(1),
}).strict();
export type CombatVerifyInput = z.infer<typeof CombatVerifyInputSchema>;

// Tool 7: combat_explain_gate
export const CombatExplainGateInputSchema = z.object({
  workspace_id: z.string().min(1),
  gate_run_id: z.string().min(1),
}).strict();
export type CombatExplainGateInput = z.infer<typeof CombatExplainGateInputSchema>;

// Tool 8: combat_propose_change
export const CombatProposeChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  base_revision: z.string().min(1),
  target_revision: z.string().min(1),
  mutations: z.array(ChangeSetMutationSchema).min(1),
  idempotency_key: z.string().optional(),
}).strict();
export type CombatProposeChangeInput = z.infer<typeof CombatProposeChangeInputSchema>;

// Tool 9: combat_get_change
export const CombatGetChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
}).strict();
export type CombatGetChangeInput = z.infer<typeof CombatGetChangeInputSchema>;

// Tool 10: combat_withdraw_change
export const CombatWithdrawChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type CombatWithdrawChangeInput = z.infer<typeof CombatWithdrawChangeInputSchema>;

// Tool 11: combat_apply_change
export const CombatApplyChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
  current_project_revision: z.string().min(1).optional(),
  canonical_snapshot_hash: z.string().optional(),
  simulation_input_hash: z.string().optional(),
  simulation_output: z.record(z.unknown()).optional(),
  gate_result: z.record(z.unknown()).optional(),
  approved_by: z.string().optional(),
  approved_at: z.string().optional(),
  approver_principal: z.record(z.unknown()).optional(),
}).strict();
export type CombatApplyChangeInput = z.infer<typeof CombatApplyChangeInputSchema>;
