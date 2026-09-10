import { z } from "zod";
import { PrincipalTypeSchema } from "./auth.js";

export const AuditEventSchema = z.object({
  correlation_id: z.string().min(1),
  principal_id: z.string().min(1),
  principal_type: PrincipalTypeSchema,
  workspace_id: z.string().min(1),
  operation: z.string().min(1),
  tool_name: z.string().min(1),
  authorization_decision: z.enum(["ALLOW", "DENY"]),
  request_hash: z.string().min(1),
  response_hash: z.string().min(1),
  result_status: z.string().min(1),
  timestamp: z.string().min(1),
  error_code: z.string().optional(),
}).strict();

export type AuditEvent = z.infer<typeof AuditEventSchema>;


