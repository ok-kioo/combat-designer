import { z } from "zod";
import { ChangeSetMutationSchema } from "./changeset.js";

export const TOOL_ALIASES: Record<string, string> = {
  query_combat: "combat_search",
  simulate_changeset: "combat_simulate",
  analyze_combat: "combat_analyze",
  propose_changeset: "combat_propose_change",
  withdraw_changeset: "combat_withdraw_change",
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
  "combat_analyze",
  "combat_propose_change",
  "combat_get_change",
  "combat_withdraw_change",
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

// Tool 6: combat_analyze
export const CombatAnalyzeInputSchema = z.object({
  workspace_id: z.string().min(1),
  subject: z.string().min(1),
  target_attack_id: z.string().optional(),
  sequence: z.array(z.string()).optional(),
}).strict();
export type CombatAnalyzeInput = z.infer<typeof CombatAnalyzeInputSchema>;

// Tool 7: combat_propose_change
export const CombatProposeChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  base_revision: z.string().min(1),
  target_revision: z.string().min(1),
  mutations: z.array(ChangeSetMutationSchema).min(1),
  idempotency_key: z.string().optional(),
}).strict();
export type CombatProposeChangeInput = z.infer<typeof CombatProposeChangeInputSchema>;

// Tool 8: combat_get_change
export const CombatGetChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
}).strict();
export type CombatGetChangeInput = z.infer<typeof CombatGetChangeInputSchema>;

// Tool 9: combat_withdraw_change
export const CombatWithdrawChangeInputSchema = z.object({
  workspace_id: z.string().min(1),
  changeset_id: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type CombatWithdrawChangeInput = z.infer<typeof CombatWithdrawChangeInputSchema>;
