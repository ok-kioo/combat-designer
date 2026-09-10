import { z } from "zod";

export const RawExtractionItemSchema = z.object({
  asset_id: z.string().min(1, "asset_id is required"),
  source_path: z.string().min(1, "source_path is required"),
  source_hash: z.string().min(1, "source_hash is required"),
  raw_payload: z.record(z.string(), z.unknown()),
  untrusted_text: z.literal(true),
  engine: z.string().min(1),
  project_revision: z.string().min(1),
  parser_version: z.string().min(1),
});

export type RawExtractionItem = z.infer<typeof RawExtractionItemSchema>;

export const RawExtractionSchema = z.object({
  workspace_id: z.string().min(1, "workspace_id is required"),
  project_id: z.string().min(1, "project_id is required"),
  project_revision: z.string().min(1, "project_revision is required"),
  engine: z.string().min(1),
  parser_version: z.string().min(1),
  items: z.array(RawExtractionItemSchema),
});

export type RawExtraction = z.infer<typeof RawExtractionSchema>;
