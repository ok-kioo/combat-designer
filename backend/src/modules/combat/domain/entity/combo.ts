import { z } from "zod";

export type ComboSource = "USER_CREATED" | "AI_DISCOVERED" | "IMPORTED";

export const ComboStepSchema = z.object({
  index: z.number().int().nonnegative(),
  attack_id: z.string().min(1),
  condition: z.enum(["on_hit", "on_block", "always"]).default("on_hit"),
  notes: z.string().optional(),
});
export type ComboStep = z.infer<typeof ComboStepSchema>;

export const ComboAiEvidenceSchema = z.object({
  simulation_id: z.string(),
  project_revision: z.string(),
  character_id: z.string(),
  input_hash: z.string(),
  evidence: z.record(z.unknown()).default({}),
  discovered_at: z.string(),
});
export type ComboAiEvidence = z.infer<typeof ComboAiEvidenceSchema>;

export const ComboSchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  character_id: z.string().min(1),
  name: z.string().min(1),
  source: z.enum(["USER_CREATED", "AI_DISCOVERED", "IMPORTED"]),
  steps: z.array(ComboStepSchema).min(1),
  notes: z.string().optional(),
  evidence: ComboAiEvidenceSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Combo = z.infer<typeof ComboSchema>;

export const ComboEvaluationSchema = z.object({
  combo_id: z.string().min(1),
  damage: z.number().int().nonnegative(),
  hits: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  simulation_id: z.string(),
  project_revision: z.string(),
  simulation_input_hash: z.string(),
  computed_at: z.string(),
  is_stale: z.boolean().default(false),
});
export type ComboEvaluation = z.infer<typeof ComboEvaluationSchema>;
