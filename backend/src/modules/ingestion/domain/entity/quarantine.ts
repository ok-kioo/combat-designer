import { z } from "zod";

export const QuarantineRecordSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  project_revision: z.string().min(1),
  asset_id: z.string().min(1),
  source_path: z.string().min(1),
  reason: z.string().min(1),
  raw_reference: z.unknown().optional(),
  parser_version: z.string().min(1),
  quarantined_at: z.string().min(1),
});

export type QuarantineRecord = z.infer<typeof QuarantineRecordSchema>;
