import { z } from "zod";

export const WorkspaceIdSchema = z.string().min(1, "workspace_id must not be empty");

export const WorkspaceRoleSchema = z.enum(["owner", "designer", "viewer", "system"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const WorkspaceMemberSchema = z.object({
  principal_id: z.string().min(1),
  role: WorkspaceRoleSchema,
  joined_at: z.string().min(1),
}).strict();
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const WorkspaceSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  owner_id: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  members: z.array(WorkspaceMemberSchema).default([]),
}).strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceContextSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  principal_id: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
}).strict();
export type WorkspaceContext = z.infer<typeof WorkspaceContextSchema>;
