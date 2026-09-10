import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  password_hash: z.string().min(1),
  display_name: z.string().min(1),
  email: z.string().email().optional(),
  status: z.enum(["active", "disabled"]).default("active"),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  last_login_at: z.string().nullable().default(null),
}).strict();
export type User = z.infer<typeof UserSchema>;

export const UserPublicSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  display_name: z.string().min(1),
  email: z.string().email().optional(),
  status: z.enum(["active", "disabled"]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).strict();
export type UserPublic = z.infer<typeof UserPublicSchema>;

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

/**
 * AccessTokenClaims represents the canonical identity encoded in the JWT access token.
 * Contains sub (user_id), username, display_name, iat, exp.
 * In accordance with Spec 12: never includes a list of workspaces or permissions.
 */
export interface AccessTokenClaims {
  sub: string; // user_id
  username: string;
  display_name: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
}
