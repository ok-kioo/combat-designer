import { z } from "zod";

export const PrincipalTypeSchema = z.enum(["human", "llm", "service", "system"]);
export type PrincipalType = z.infer<typeof PrincipalTypeSchema>;

export const CapabilitySchema = z.enum([
  "combat:read",
  "combat:query",
  "combat:simulate",
  "combat:verify",
  "combat:propose",
  "changeset:withdraw",
  "changeset:approve",
  "changeset:apply",
  "admin:workspace",
  "admin:policy",
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const PrincipalSchema = z.object({
  principal_id: z.string().min(1),
  principal_type: PrincipalTypeSchema,
  capabilities: z.array(CapabilitySchema),
  authorized_workspaces: z.array(z.string().min(1)),
}).strict();

export type Principal = z.infer<typeof PrincipalSchema>;

export const AuthorizationDecisionSchema = z.discriminatedUnion("allowed", [
  z.object({
    allowed: z.literal(true),
    reason: z.string().optional(),
  }).strict(),
  z.object({
    allowed: z.literal(false),
    reason: z.string(),
    code: z.string(),
  }).strict(),
]);

export type AuthorizationDecision = z.infer<typeof AuthorizationDecisionSchema>;
