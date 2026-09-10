import { z } from "zod";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogOperationStatus =
  | "SUCCESS"
  | "DENIED"
  | "FAILED"
  | "ERROR"
  | "BLOCKED"
  | "STALE"
  | "BUDGET_EXCEEDED";

export interface LogEvent {
  timestamp: string; // ISO 8601 UTC
  level: LogLevel;
  event_name: string;
  workspace_id?: string;
  principal_id?: string;
  correlation_id?: string;
  request_id?: string;
  tool_id?: string;
  operation?: string;
  status?: LogOperationStatus;
  duration_ms?: number;
  error_code?: string;
  details?: Record<string, unknown>;
}

export const LogEventSchema = z.object({
  timestamp: z.string(),
  level: z.enum(["debug", "info", "warn", "error"]),
  event_name: z.string().min(1),
  workspace_id: z.string().optional(),
  principal_id: z.string().optional(),
  correlation_id: z.string().optional(),
  request_id: z.string().optional(),
  tool_id: z.string().optional(),
  operation: z.string().optional(),
  status: z.enum(["SUCCESS", "DENIED", "FAILED", "ERROR", "BLOCKED", "STALE", "BUDGET_EXCEEDED"]).optional(),
  duration_ms: z.number().min(0).optional(),
  error_code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "password",
  "password_hash",
  "authorization",
  "api_key",
  "secret",
  "credential",
  "cookie",
  "bearer",
  "apikey",
  "auth",
]);

/**
 * Recursively redacts sensitive values from objects, arrays, and strings.
 * Ensures zero secrets or tokens leak into operational telemetry.
 */
export function redactSensitiveData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Redact Bearer tokens in headers
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]") as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("token")) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitiveData(val);
      }
    }
    return result as unknown as T;
  }

  return data;
}
