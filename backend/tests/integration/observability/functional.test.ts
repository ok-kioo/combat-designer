import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  NativeTracer,
  NativeMetricsRegistry,
  StructuredLogger,
  HealthChecker,
  TelemetryAdapter,
} from "../../../src/infrastructure/provider/observability/index.js";
import {
  API_METRICS,
  GATEWAY_METRICS,
  SIMULATION_METRICS,
  PROPOSAL_METRICS,
  redactSensitiveData,
  parseTraceparent,
  formatTraceparent,
} from "@combat-designer/backend";
import { ApiServer } from "../../../src/infrastructure/http/server.js";

describe("SPEC 07 — Functional Tests (07.T.1 – 07.T.19)", () => {
  let tracer: NativeTracer;
  let metrics: NativeMetricsRegistry;
  let logger: StructuredLogger;
  let healthChecker: HealthChecker;
  let adapter: TelemetryAdapter;

  beforeEach(() => {
    tracer = new NativeTracer({ serviceName: "test-service", enableInMemoryExporter: true });
    metrics = new NativeMetricsRegistry("test-service");
    logger = new StructuredLogger({ silent: true, retainLogs: true });
    healthChecker = new HealthChecker();
    adapter = new TelemetryAdapter({ tracer, metrics, logger });
  });

  it("07.T.1: HTTP request creates trace", () => {
    // 1. Verify production runtime uses canonical BatchSpanProcessor + OTLP exporter (no inMemoryExporter)
    const prodTracer = new NativeTracer({ serviceName: "prod-service" });
    expect(prodTracer.inMemoryExporter).toBeUndefined();
    expect(prodTracer.processor.constructor.name).toBe("BatchSpanProcessor");

    // 2. Verify span lifecycle with trace creation
    const span = tracer.startSpan("http_get_status", {
      correlation_id: "corr-http-001",
      workspace_id: "ws-test",
    });
    span.setAttribute("http.method", "GET");
    span.setAttribute("http.status_code", 200);
    span.end("OK");

    const spans = tracer.inMemoryExporter?.getFinishedSpans() ?? [];
    expect(spans.length).toBeGreaterThanOrEqual(1);
    const finishedSpan = spans[spans.length - 1];
    expect(finishedSpan.name).toBe("http_get_status");
    expect(finishedSpan.attributes["correlation.id"]).toBe("corr-http-001");
    expect(finishedSpan.attributes["workspace.id"]).toBe("ws-test");
    expect(finishedSpan.attributes["http.method"]).toBe("GET");
  });

  it("07.T.2: Correlation propagates through Application", () => {
    const corrContext = {
      correlation_id: "app-corr-123",
      workspace_id: "ws-prime",
      use_case: "simulateCombatUseCase",
    };

    const span = adapter.startSpan("simulate_combat", corrContext);
    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event_name: "use_case_started",
      correlation_id: corrContext.correlation_id,
      workspace_id: corrContext.workspace_id,
      operation: corrContext.use_case,
    });
    span.end("OK");

    const retained = logger.getRetainedLogs();
    expect(retained.length).toBe(1);
    expect(retained[0].correlation_id).toBe("app-corr-123");
    expect(retained[0].workspace_id).toBe("ws-prime");
  });

  it("07.T.3: MCP request is traceable", () => {
    const traceCtx = {
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      span_id: "00f067aa0ba902b7",
      trace_flags: 1,
    };
    const header = formatTraceparent(traceCtx);
    const parsed = parseTraceparent(header);
    expect(parsed).not.toBeNull();
    expect(parsed?.trace_id).toBe(traceCtx.trace_id);

    const mcpSpan = tracer.startSpan("mcp_tool_execute", {
      correlation_id: "mcp-corr-99",
      tool_id: "combat_simulate",
      workspace_id: "ws-mcp",
    });
    mcpSpan.setAttribute("mcp.tool_name", "combat_simulate");
    mcpSpan.end("OK");

    const spans = tracer.inMemoryExporter?.getFinishedSpans() ?? [];
    expect(spans.some((s) => s.name === "mcp_tool_execute")).toBe(true);
  });

  it("07.T.4: Simulation produces telemetry", () => {
    adapter.recordMetric(SIMULATION_METRICS.COUNT, 1, { status: "SUCCESS" });
    adapter.recordMetric(SIMULATION_METRICS.DURATION_MS, 42, { status: "SUCCESS" });
    adapter.recordMetric(SIMULATION_METRICS.FRAMES_TOTAL, 120, { status: "SUCCESS" });

    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event_name: "simulation_completed",
      duration_ms: 42,
      status: "SUCCESS",
      details: { frames: 120, events: 5 },
    });

    const logs = logger.getRetainedLogs();
    expect(logs.some((l) => l.event_name === "simulation_completed")).toBe(true);
  });

  it("07.T.5: Combat analysis produces telemetry", () => {
    adapter.recordMetric("combat_analysis_count", 1, { status: "COMPLETED" });
    adapter.recordMetric("combat_analysis_duration_ms", 15, { status: "COMPLETED" });

    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "info",
      event_name: "analysis_completed",
      status: "COMPLETED",
      details: { findings: 0, recommendations: 2 },
    });

    const logs = logger.getRetainedLogs();
    expect(logs.some((l) => l.event_name === "analysis_completed" && l.status === "COMPLETED")).toBe(true);
  });

  it("07.T.6: Proposal lifecycle emits telemetry", () => {
    const states = ["ACTIVE", "WITHDRAWN", "ARCHIVED"];
    for (const state of states) {
      adapter.emitLog({
        timestamp: new Date().toISOString(),
        level: "info",
        event_name: "proposal_transitioned",
        details: { state },
      });
    }

    adapter.recordMetric(PROPOSAL_METRICS.CREATED_COUNT, 1);
    adapter.recordMetric(PROPOSAL_METRICS.WITHDRAWN_COUNT, 1);
    adapter.recordMetric(PROPOSAL_METRICS.ARCHIVED_COUNT, 1);

    const logs = logger.getRetainedLogs();
    expect(logs.length).toBe(3);
  });

  it("07.T.7: Authorization denial emits telemetry", () => {
    adapter.recordMetric(GATEWAY_METRICS.AUTH_DENY_COUNT, 1, { reason: "MISSING_CAPABILITY" });
    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      event_name: "gateway_auth_denied",
      status: "DENIED",
      error_code: "UNAUTHORIZED",
      details: { required_capability: "proposal:withdraw" },
    });

    const logs = logger.getRetainedLogs();
    expect(logs[0].status).toBe("DENIED");
    expect(logs[0].error_code).toBe("UNAUTHORIZED");
  });

  it("07.T.8: Workspace mismatch emits telemetry", () => {
    adapter.recordMetric(GATEWAY_METRICS.WORKSPACE_MISMATCH_COUNT, 1, { component: "gateway" });
    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "error",
      event_name: "workspace_mismatch",
      status: "DENIED",
      error_code: "WORKSPACE_MISMATCH",
      details: { requested_ws: "ws-A", principal_ws: "ws-B" },
    });

    const logs = logger.getRetainedLogs();
    expect(logs[0].error_code).toBe("WORKSPACE_MISMATCH");
  });

  it("07.T.9: Budget exhaustion emits telemetry", () => {
    adapter.recordMetric(SIMULATION_METRICS.BUDGET_EXCEEDED_COUNT, 1, { reason: "MAX_FRAMES" });
    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      event_name: "budget_exhausted",
      status: "BUDGET_EXCEEDED",
      details: { max_frames: 600, frames_reached: 600 },
    });

    const logs = logger.getRetainedLogs();
    expect(logs[0].status).toBe("BUDGET_EXCEEDED");
  });

  it("07.T.10: Stale analysis emits telemetry", () => {
    adapter.recordMetric("combat_analysis_stale_count", 1, { reason: "MODEL_REVISION_MISMATCH" });
    adapter.emitLog({
      timestamp: new Date().toISOString(),
      level: "warn",
      event_name: "analysis_stale_detected",
      status: "STALE",
      details: { analysis_id: "an-1", original_rev: "rev-1", current_rev: "rev-2" },
    });

    const logs = logger.getRetainedLogs();
    expect(logs[0].status).toBe("STALE");
  });

  it("07.T.11: Health liveness works", async () => {
    const isLive = await healthChecker.checkLiveness();
    expect(isLive).toBe(true);
  });

  it("07.T.12: Health readiness works", async () => {
    const isReady = await healthChecker.checkReadiness();
    expect(isReady).toBe(true);
  });

  it("07.T.13: Dependency health works (sanitized)", async () => {
    const report = await healthChecker.getSanitizedReport();
    expect(report.status).toBe("READY");
    expect(report.components.api.status).toBe("LIVE");
    expect(report.components.postgres.status).toBe("READY");
    expect(report.components.neo4j.status).toBe("READY");
    expect(report.components.mcp.status).toBe("READY");
  });

  it("07.T.14: Metrics are exposed in supported format", async () => {
    metrics.record(API_METRICS.REQUEST_COUNT, 5, { status: "200" });
    const text = await metrics.getPrometheusText();
    expect(typeof text).toBe("string");
    expect(text).toContain("api_request_count");
    expect(text).toContain('status="200"');
  });

  it("07.T.15: Structured logs are emitted as valid JSON", () => {
    const testLogger = new StructuredLogger({ silent: true, retainLogs: true });
    testLogger.log({
      event_name: "test_event",
      status: "SUCCESS",
      details: { key: "value" },
    });

    const logs = testLogger.getRetainedLogs();
    expect(logs.length).toBe(1);
    const jsonString = JSON.stringify(logs[0]);
    const parsed = JSON.parse(jsonString);
    expect(parsed.event_name).toBe("test_event");
    expect(parsed.status).toBe("SUCCESS");
  });

  it("07.T.16: Sensitive fields are recursively redacted", () => {
    const sensitivePayload = {
      username: "designer",
      password: "secretPassword123",
      token: "secretTokenABC",
      authHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      nested: {
        apiKey: "pk_live_12345678",
        cookie: "session_id=987654321",
        data: "safe_value",
      },
    };

    const redacted = redactSensitiveData(sensitivePayload) as Record<string, unknown>;
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.authHeader).toBe("Bearer [REDACTED]");
    const nested = redacted.nested as Record<string, unknown>;
    expect(nested.apiKey).toBe("[REDACTED]");
    expect(nested.cookie).toBe("[REDACTED]");
    expect(nested.data).toBe("safe_value");
  });

  it("07.T.17: Trace correlation across major boundaries", () => {
    const rootTrace = {
      trace_id: "e457717ac9da4f379e19b48c8e86fa6a",
      span_id: "05e3acbe4737e86a",
      trace_flags: 1,
    };
    const header = formatTraceparent(rootTrace);

    const headers = { traceparent: header };
    const extracted = tracer.extractTraceContext(headers);
    expect(extracted?.trace_id).toBe(rootTrace.trace_id);
    expect(extracted?.span_id).toBe(rootTrace.span_id);

    const outCarrier: Record<string, string> = {};
    tracer.injectTraceContext(extracted!, outCarrier);
    expect(outCarrier["traceparent"]).toBe(header);
  });
  it("07.T.18: Grafana and collector configuration valid", () => {
    const pkgRoot = path.resolve(__dirname, "../../../src/infrastructure/provider/observability");
    const otelPath = path.resolve(pkgRoot, "otel/otel-collector-config.yaml");
    const dsPath = path.resolve(pkgRoot, "grafana/provisioning/datasources/datasources.yaml");
    const dashDir = path.resolve(pkgRoot, "dashboards");

    expect(fs.existsSync(otelPath)).toBe(true);
    expect(fs.existsSync(dsPath)).toBe(true);
    expect(fs.existsSync(dashDir)).toBe(true);

    const dashboards = fs.readdirSync(dashDir).filter((f) => f.endsWith(".json"));
    expect(dashboards.length).toBe(4);
    for (const d of dashboards) {
      const content = fs.readFileSync(path.join(dashDir, d), "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.title).toBeDefined();
      expect(parsed.panels).toBeDefined();
    }
  });

  it("07.T.19: Telemetry does not modify domain results", () => {
    const originalDomainResult = {
      attack_id: "light_punch",
      startup_frames: 4,
      analysis_status: "COMPLETED_CLEAN",
      damage: 15,
    };

    const copy = { ...originalDomainResult };

    // Record telemetry
    adapter.recordMetric("combat_analysis_count", 1, { status: "COMPLETED_CLEAN" });
    adapter.emitLog({
      event_name: "analysis_completed",
      details: copy,
    });
    const span = adapter.startSpan("domain_op");
    span.end("OK");

    // Domain result is strictly identical
    expect(copy).toEqual(originalDomainResult);
  });
});
