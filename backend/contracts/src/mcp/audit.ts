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

const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "bearer",
  "credential",
]);

export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
