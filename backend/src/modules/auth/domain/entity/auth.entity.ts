import { z } from "zod";
import {
  WorkspaceRoleSchema,
  type WorkspaceRole,
} from "../../../workspace/domain/entity/workspace.js";

export { WorkspaceRoleSchema, type WorkspaceRole };

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  password_hash: z.string().min(1),
  display_name: z.string().min(1),
  status: z.enum(["active", "disabled"]).default("active"),
  created_at: z.string().min(1),
  last_login_at: z.string().nullable().default(null),
}).strict();
export type User = z.infer<typeof UserSchema>;

export const UserPublicSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  display_name: z.string().min(1),
  status: z.enum(["active", "disabled"]),
  created_at: z.string().min(1),
}).strict();
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const WorkspaceMembershipSchema = z.object({
  workspace_id: z.string().min(1),
  user_id: z.string().min(1),
  role: WorkspaceRoleSchema,
  added_at: z.string().min(1),
}).strict();
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;

export const RefreshTokenSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  token_hash: z.string().min(1),
  issued_at: z.string().min(1),
  expires_at: z.string().min(1),
  revoked_at: z.string().nullable().default(null),
  replaced_by: z.string().nullable().default(null),
}).strict();
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;

export interface WorkspaceClaim {
  workspace_id: string;
  role: WorkspaceRole;
}

export interface AccessTokenClaims {
  sub: string; // user_id
  email: string;
  display_name: string;
  workspaces: WorkspaceClaim[];
  iat: number;
  exp: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}
