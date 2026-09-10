import { z } from "zod";

export const SupportedEngineEnum = z.enum(["unity", "unreal", "godot"]);
export type SupportedEngine = z.infer<typeof SupportedEngineEnum>;

export const IngestionFormatEnum = z.enum([
  "unity-yaml-scriptable-object",
  "godot-tres",
  "unreal-json",
]);
export type IngestionFormat = z.infer<typeof IngestionFormatEnum>;

export const ExportBundleManifestSchema = z.object({
  schema_version: z.string().min(1, "schema_version is required"),
  engine: SupportedEngineEnum,
  engine_version: z.string().min(1, "engine_version is required"),
  project_id: z.string().min(1, "project_id is required"),
  project_revision: z.string().min(1, "project_revision is required"),
  exporter_version: z.string().min(1, "exporter_version is required"),
  parser_version: z.string().min(1, "parser_version is required"),
  format: z.string().min(1, "format is required"),
  workspace_id: z.string().min(1, "workspace_id is required"),
  exported_at: z.string().min(1, "exported_at is required"),
  asset_count: z.number().int().nonnegative(),
  checksums: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i, "Checksum must be sha256 hex")),
  bundle_hash: z.string().regex(/^[a-f0-9]{64}$/i, "bundle_hash must be sha256 hex"),
});

export type ExportBundleManifest = z.infer<typeof ExportBundleManifestSchema>;
