import { z } from "zod";

export type HealthStatus = "LIVE" | "READY" | "DEGRADED" | "UNHEALTHY";

export interface SanitizedComponentHealth {
  status: HealthStatus;
  latency_ms?: number;
  last_checked_at: string;
}

export interface SanitizedSystemHealthReport {
  status: HealthStatus;
  timestamp: string;
  components: {
    api: SanitizedComponentHealth;
    postgres: SanitizedComponentHealth;
    neo4j: SanitizedComponentHealth;
    mcp: SanitizedComponentHealth;
  };
}

export const SanitizedComponentHealthSchema = z.object({
  status: z.enum(["LIVE", "READY", "DEGRADED", "UNHEALTHY"]),
  latency_ms: z.number().min(0).optional(),
  last_checked_at: z.string(),
});

export const SanitizedSystemHealthReportSchema = z.object({
  status: z.enum(["LIVE", "READY", "DEGRADED", "UNHEALTHY"]),
  timestamp: z.string(),
  components: z.object({
    api: SanitizedComponentHealthSchema,
    postgres: SanitizedComponentHealthSchema,
    neo4j: SanitizedComponentHealthSchema,
    mcp: SanitizedComponentHealthSchema,
  }),
});

/**
 * Sanitizes health reports before sending HTTP responses.
 * Strictly guarantees that internal connection strings, database hostnames,
 * raw stack traces, tokens, passwords, and MCP internals are stripped out.
 */
export function sanitizeHealthReport(raw: {
  status: HealthStatus;
  timestamp: string;
  components: Record<string, { status: HealthStatus; latency_ms?: number; last_checked_at?: string }>;
}): SanitizedSystemHealthReport {
  const fallback = (status?: HealthStatus): SanitizedComponentHealth => ({
    status: status ?? "UNHEALTHY",
    last_checked_at: raw.timestamp,
  });

  return {
    status: raw.status,
    timestamp: raw.timestamp,
    components: {
      api: {
        status: raw.components.api?.status ?? "LIVE",
        latency_ms: raw.components.api?.latency_ms,
        last_checked_at: raw.components.api?.last_checked_at ?? raw.timestamp,
      },
      postgres: {
        status: raw.components.postgres?.status ?? "UNHEALTHY",
        latency_ms: raw.components.postgres?.latency_ms,
        last_checked_at: raw.components.postgres?.last_checked_at ?? raw.timestamp,
      },
      neo4j: {
        status: raw.components.neo4j?.status ?? "UNHEALTHY",
        latency_ms: raw.components.neo4j?.latency_ms,
        last_checked_at: raw.components.neo4j?.last_checked_at ?? raw.timestamp,
      },
      mcp: {
        status: raw.components.mcp?.status ?? "UNHEALTHY",
        latency_ms: raw.components.mcp?.latency_ms,
        last_checked_at: raw.components.mcp?.last_checked_at ?? raw.timestamp,
      },
    },
  };
}
