import { z } from "zod";

export const API_METRICS = {
  REQUEST_COUNT: "api_request_count",
  REQUEST_ERROR_COUNT: "api_request_error_count",
  REQUEST_LATENCY_MS: "api_request_latency_ms",
} as const;

export const GATEWAY_METRICS = {
  AUTH_ALLOW_COUNT: "gateway_auth_allow_count",
  AUTH_DENY_COUNT: "gateway_auth_deny_count",
  WORKSPACE_MISMATCH_COUNT: "gateway_workspace_mismatch_count",
  POLICY_DENIED_COUNT: "gateway_policy_denied_count",
  RATE_LIMITED_COUNT: "gateway_rate_limited_count",
} as const;

export const SIMULATION_METRICS = {
  COUNT: "simulation_count",
  FAILURE_COUNT: "simulation_failure_count",
  BUDGET_EXCEEDED_COUNT: "simulation_budget_exceeded_count",
  BUDGET_EXCEEDED_TOTAL: "simulation_budget_exceeded_total",
  DURATION_MS: "simulation_duration_ms",
  FRAMES_TOTAL: "simulation_frames_total",
  EVENTS_TOTAL: "simulation_events_total",
} as const;

export const INGESTION_METRICS = {
  BUNDLE_RECEIVED_COUNT: "ingestion_bundle_received_count",
  BUNDLE_REJECTED_TOTAL: "ingestion_bundle_rejected_total",
  BUNDLE_PROCESSED_COUNT: "ingestion_bundle_processed_count",
  ASSETS_QUARANTINED_COUNT: "ingestion_assets_quarantined_count",
  CONFLICTS_TOTAL: "ingestion_conflicts_total",
} as const;

export const GATE_METRICS = {
  RUN_COUNT: "gate_run_count",
  PASS_COUNT: "gate_pass_count",
  FAIL_COUNT: "gate_fail_count",
  BLOCKED_COUNT: "gate_blocked_count",
  STALE_COUNT: "gate_stale_count",
  BUDGET_EXCEEDED_COUNT: "gate_budget_exceeded_count",
  ERROR_COUNT: "gate_error_count",
  DURATION_MS: "gate_duration_ms",
} as const;

export const CHANGESET_METRICS = {
  PROPOSED_COUNT: "changeset_proposed_count",
  SIMULATED_COUNT: "changeset_simulated_count",
  VERIFIED_COUNT: "changeset_verified_count",
  APPROVED_COUNT: "changeset_approved_count",
  APPLIED_COUNT: "changeset_applied_count",
  WITHDRAWN_COUNT: "changeset_withdrawn_count",
  REJECTED_COUNT: "changeset_rejected_count",
} as const;

/**
 * High-cardinality identifiers that are strictly FORBIDDEN as metric labels.
 * Metric labels must remain low-cardinality and aggregateable.
 */
export const FORBIDDEN_METRIC_LABELS = new Set([
  "trace_id",
  "span_id",
  "request_id",
  "correlation_id",
  "attack_id",
  "changeset_id",
  "simulation_id",
  "gate_run_id",
  "event_id",
]);

/**
 * Validates label keys to enforce cardinality protection.
 */
export function validateMetricLabels(labels?: Record<string, string>): {
  valid: boolean;
  forbiddenKey?: string;
  forbiddenKeys?: string[];
} {
  if (!labels) return { valid: true };
  const forbidden: string[] = [];
  for (const key of Object.keys(labels)) {
    if (FORBIDDEN_METRIC_LABELS.has(key.toLowerCase())) {
      forbidden.push(key);
    }
  }
  if (forbidden.length > 0) {
    return { valid: false, forbiddenKey: forbidden[0], forbiddenKeys: forbidden };
  }
  return { valid: true };
}

/**
 * Fail-safe sanitizer:
 * - Strictly removes ONLY keys that match FORBIDDEN_METRIC_LABELS (never removes arbitrary attributes).
 * - Adds an explicit operational indicator ('cardinality_sanitized': 'true') when sanitization occurs.
 * - Never alters business logic, domain authority, or throws exceptions.
 */
export function sanitizeMetricLabels(labels?: Record<string, string>): Record<string, string> {
  if (!labels) return {};
  const clean: Record<string, string> = {};
  let sanitized = false;

  for (const [key, value] of Object.entries(labels)) {
    if (FORBIDDEN_METRIC_LABELS.has(key.toLowerCase())) {
      sanitized = true;
    } else {
      clean[key] = String(value);
    }
  }

  if (sanitized) {
    clean["cardinality_sanitized"] = "true";
  }

  return clean;
}
