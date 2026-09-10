import { z } from "zod";

/**
 * W3C Trace Context representation (traceparent: version-trace_id-parent_id-trace_flags).
 * Standardized according to W3C Recommendation.
 */
export interface TraceContext {
  trace_id: string; // 32 lowercase hex characters
  span_id: string;  // 16 lowercase hex characters
  trace_flags?: number; // 8-bit bitmap (1 = sampled)
  tracestate?: string;
}

export const TraceContextSchema = z.object({
  trace_id: z.string().regex(/^[0-9a-f]{32}$/, "trace_id must be a 32-char hex string"),
  span_id: z.string().regex(/^[0-9a-f]{16}$/, "span_id must be a 16-char hex string"),
  trace_flags: z.number().int().min(0).max(255).optional(),
  tracestate: z.string().optional(),
});

/**
 * Request-specific metadata representing the HTTP or external caller request.
 */
export interface RequestContext {
  request_id: string;
  timestamp_utc: string;
  method?: string;
  path?: string;
}

export const RequestContextSchema = z.object({
  request_id: z.string().min(1),
  timestamp_utc: z.string(),
  method: z.string().optional(),
  path: z.string().optional(),
});

/**
 * Application-level correlation metadata passed through use cases and telemetry.
 * All fields are strictly optional except correlation_id.
 * Correlation context MUST NEVER be treated as authorization identity.
 */
export interface CorrelationContext {
  correlation_id: string;
  workspace_id?: string;
  principal_id?: string;
  principal_type?: string;
  tool_id?: string;
  use_case?: string;
  simulation_id?: string;
  gate_run_id?: string;
  changeset_id?: string;
}

export const CorrelationContextSchema = z.object({
  correlation_id: z.string().min(1),
  workspace_id: z.string().optional(),
  principal_id: z.string().optional(),
  principal_type: z.string().optional(),
  tool_id: z.string().optional(),
  use_case: z.string().optional(),
  simulation_id: z.string().optional(),
  gate_run_id: z.string().optional(),
  changeset_id: z.string().optional(),
});

/**
 * Helper to parse W3C traceparent header: '00-{trace_id}-{span_id}-{trace_flags}'
 */
export function parseTraceparent(header: string | undefined | null): TraceContext | null {
  if (!header || typeof header !== "string") return null;
  const parts = header.trim().split("-");
  if (parts.length < 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== "00") return null; // W3C version 00
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === "00000000000000000000000000000000") return null;
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === "0000000000000000") return null;
  const traceFlags = parseInt(flags, 16);
  return {
    trace_id: traceId,
    span_id: spanId,
    trace_flags: isNaN(traceFlags) ? 0 : traceFlags,
  };
}

/**
 * Helper to format TraceContext as W3C traceparent header: '00-{trace_id}-{span_id}-{trace_flags}'
 */
export function formatTraceparent(ctx: TraceContext): string {
  const flags = (ctx.trace_flags ?? 1).toString(16).padStart(2, "0");
  return `00-${ctx.trace_id}-${ctx.span_id}-${flags}`;
}

/**
 * Strictly typed OpenTelemetry span status values.
 * Arbitrary strings are forbidden.
 */
export type TelemetrySpanStatus = "UNSET" | "OK" | "ERROR";

/**
 * Canonical typed TelemetrySpan interface.
 * Ensures span.end() strictly accepts only TelemetrySpanStatus.
 */
export interface TelemetrySpan {
  setAttribute(key: string, value: string | number | boolean): void;
  recordError(error: unknown): void;
  end(status?: TelemetrySpanStatus): void;
}

