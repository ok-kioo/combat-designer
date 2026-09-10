import { z } from "zod";

export const ResponseClassificationSchema = z.enum([
  "FACT",
  "SIMULATION_RESULT",
  "INFERENCE",
  "SUGGESTION",
]);
export type ResponseClassification = z.infer<typeof ResponseClassificationSchema>;

export const ResourceEnvelopeSchema = z.object({
  uri: z.string().min(1),
  classification: ResponseClassificationSchema,
  data: z.unknown(),
  untrusted_text: z.boolean().default(false),
  source: z.string().min(1),
}).strict();

export type ResourceEnvelope = z.infer<typeof ResourceEnvelopeSchema>;

export interface ParsedResourceUri {
  workspace_id: string;
  resource_type: "attacks" | "archetypes" | "graph" | "verification" | "provenance";
  resource_id: string;
}

export function parseResourceUri(uri: string): ParsedResourceUri {
  // Reject path traversal immediately
  if (uri.includes("..") || uri.includes("%2e%2e") || uri.includes("\\")) {
    throw new Error("Invalid resource URI: path traversal detected");
  }

  const prefix = "combat://workspace/";
  if (!uri.startsWith(prefix)) {
    throw new Error(`Invalid resource URI prefix: expected '${prefix}', got '${uri}'`);
  }

  const remainder = uri.slice(prefix.length);
  const parts = remainder.split("/").filter(Boolean);

  if (parts.length !== 3) {
    throw new Error(`Invalid resource URI structure: expected combat://workspace/{workspace_id}/{type}/{id}, got '${uri}'`);
  }

  const [workspace_id, type, resource_id] = parts;
  const validTypes = ["attacks", "archetypes", "graph", "verification", "provenance"] as const;
  if (!validTypes.includes(type as (typeof validTypes)[number])) {
    throw new Error(`Invalid resource type: '${type}'. Expected one of: ${validTypes.join(", ")}`);
  }

  return {
    workspace_id,
    resource_type: type as ParsedResourceUri["resource_type"],
    resource_id,
  };
}
