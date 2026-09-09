import { z } from "zod";

export const ConflictTypeEnum = z.enum([
  "version_mismatch",
  "checksum_mismatch",
  "duplicate_identity",
  "manifest_tampered",
  "unsupported_format",
  "workspace_mismatch",
]);
export type ConflictType = z.infer<typeof ConflictTypeEnum>;

export const ConflictRecordSchema = z.object({
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  project_revision: z.string().min(1),
  conflict_type: ConflictTypeEnum,
  details: z.string().min(1),
  conflicting_items: z.array(z.string()).default([]),
  detected_at: z.string().min(1),
});

export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;
