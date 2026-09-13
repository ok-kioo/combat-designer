import { z } from "zod";

export const FindingSchema = z.object({
  id: z.string(),
  type: z.enum(["loop_detected", "excessive_damage", "low_recovery", "lacks_counterplay", "frame_advantage", "info"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  description: string(),
  attack_ids: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof FindingSchema>;

function string() {
  return z.string();
}

export const RecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  suggested_action: z.string(),
  target_attack_id: z.string().optional(),
  evidence_summary: z.string(),
  validation_outcome: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const AnalysisSchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  character_id: z.string().nullable().optional(),
  subject: z.string().min(1),
  input: z.record(z.unknown()).default({}),
  evidence: z.record(z.unknown()).default({}),
  simulation_refs: z.array(z.string()).default([]),
  findings: z.array(FindingSchema).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  project_revision: z.string().default("rev-1"),
  created_at: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
