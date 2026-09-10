import { z } from "zod";

export const WorkspaceIdSchema = z.string().min(1, "workspace_id must not be empty");

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  owner_user_id: z.string().min(1, "owner_user_id must not be empty"),
  name: z.string().min(1, "name must not be empty"),
  description: z.string().optional(),
  engine: z.string().optional(),
  engine_version: z.string().optional(),
  status: z.enum(["active", "archived"]).default("active"),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceContextSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  principal_id: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
}).strict();
export type WorkspaceContext = z.infer<typeof WorkspaceContextSchema>;
