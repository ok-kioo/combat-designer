import { z } from "zod";

export const CharacterProvenanceSchema = z.object({
  source_asset: z.string().optional(),
  engine_id: z.string().optional(),
  imported_at: z.string(),
  importer: z.string(),
});
export type CharacterProvenance = z.infer<typeof CharacterProvenanceSchema>;

export const CharacterSchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  engine_id: z.string().optional(),
  name: z.string().min(1),
  display_name: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  provenance: CharacterProvenanceSchema,
});
export type Character = z.infer<typeof CharacterSchema>;

export interface CharacterSummary {
  character_id: string;
  name: string;
  display_name?: string;
  attacks_count: number;
  combos_count: number;
  max_combo_damage?: number;
  last_analysis_at?: string;
}
