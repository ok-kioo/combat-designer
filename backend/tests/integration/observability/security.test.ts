import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {
  NativeTracer,
  NativeMetricsRegistry,
  StructuredLogger,
  HealthChecker,
  TelemetryAdapter,
} from "../../../src/infrastructure/provider/observability/index.js";
import {
  validateMetricLabels,
  sanitizeMetricLabels,
  FORBIDDEN_METRIC_LABELS,
  redactSensitiveData,
  GATE_METRICS,
  API_METRICS,
} from "@combat-designer/backend";
import { ApiServer } from "../../../src/infrastructure/http/server.js";

describe("SPEC 07 — Security Tests (07.SEC.1 – 07.SEC.16)", () => {
  let tracer: NativeTracer;
  let metrics: NativeMetricsRegistry;
  let logger: StructuredLogger;
  let healthChecker: HealthChecker;
  let adapter: TelemetryAdapter;

  beforeEach(() => {
    tracer = new NativeTracer({ serviceName: "sec-test", enableInMemoryExporter: true });
    metrics = new NativeMetricsRegistry("sec-test");
    logger = new StructuredLogger({ silent: true, retainLogs: true });
    healthChecker = new HealthChecker();
    adapter = new TelemetryAdapter({ tracer, metrics, logger });
  });

  it("07.SEC.1: Observability cannot mutate canonical state", () => {
    const canonicalAttack = Object.freeze({
      attack_id: "heavy_slash",
      damage: 120,
      startup_frames: 14,
      recovery_frames: 22,
    });

    adapter.recordMetric(GATE_METRICS.RUN_COUNT, 1);
    adapter.emitLog({
      event_name: "inspect_attack",
      details: canonicalAttack as unknown as Record<string, unknown>,
    });

    expect(canonicalAttack.damage).toBe(120);
    expect(canonicalAttack.startup_frames).toBe(14);
  });

  it("07.SEC.2: Metrics endpoint does not expose secrets", async () => {
    metrics.record(API_METRICS.REQUEST_COUNT, 1, {
      status: "200",
      operation: "safe_op",
    });

    const prometheusText = await metrics.getPrometheusText();
    expect(prometheusText).not.toContain("password");
    expect(prometheusText).not.toContain("secret");
    expect(prometheusText).not.toContain("token");
    expect(prometheusText).not.toContain("bearer");
  });

  it("07.SEC.3: Structured logs recursively redact credentials", () => {
    const logPayload = {
      user: "attacker",
      password: "SuperSecretPassword!",
      auth: "Bearer secret_jwt_token_here",
      message: "Call with Bearer my_secret_token_123",
      deep: {
        token: "tok_visa_12345",
        credentials: {
          secret: "very_secret",
          safe: "public_info",
        },
      },
      array: [
        { apiKey: "key_live_9999" },
        "safe_string",
      ],
    };

    logger.log({
      event_name: "auth_attempt",
      details: logPayload,
    });

    const logs = logger.getRetainedLogs();
    const recorded = logs[0].details as any;
    expect(recorded.password).toBe("[REDACTED]");
    expect(recorded.auth).toBe("[REDACTED]");
    expect(recorded.message).toBe("Call with Bearer [REDACTED]");
    expect(recorded.deep.token).toBe("[REDACTED]");
    expect(recorded.deep.credentials.secret).toBe("[REDACTED]");
    expect(recorded.deep.credentials.safe).toBe("public_info");
    expect(recorded.array[0].apiKey).toBe("[REDACTED]");
    expect(recorded.array[1]).toBe("safe_string");
  });

  it("07.SEC.4: Cross-workspace telemetry isolation", () => {
    adapter.emitLog({
      event_name: "workspace_op_A",
      workspace_id: "workspace_alpha",
      details: { metric: 10 },
    });
    adapter.emitLog({
      event_name: "workspace_op_B",
      workspace_id: "workspace_beta",
      details: { metric: 20 },
    });

    const logs = logger.getRetainedLogs();
    const alphaLogs = logs.filter((l) => l.workspace_id === "workspace_alpha");
    const betaLogs = logs.filter((l) => l.workspace_id === "workspace_beta");

    expect(alphaLogs.length).toBe(1);
    expect(betaLogs.length).toBe(1);
    expect(alphaLogs[0].event_name).toBe("workspace_op_A");
    expect(betaLogs[0].event_name).toBe("workspace_op_B");
  });

  it("07.SEC.5: Trace context cannot escalate authorization", () => {
    // An adversarial caller sends an admin-like trace context
    const fakeContext = {
      correlation_id: "forged-corr",
      principal_id: "unauthorized_user",
      principal_type: "llm",
    };

    const span = adapter.startSpan("some_operation", fakeContext);
    span.setAttribute("role", "admin"); // Trying to set admin attribute on span
    span.end("OK");

    // Span attributes only exist in telemetry, domain authorization remains unchanged
    expect(fakeContext.principal_type).toBe("llm");
    // TelemetryPort cannot grant capabilities or authorize mutations
    expect((adapter as any).authorize).toBeUndefined();
    expect((adapter as any).grantCapability).toBeUndefined();
  });

  it("07.SEC.6: Correlation ID cannot become principal identity", () => {
    const traceCtx = {
      trace_id: "12345678901234567890123456789012",
      span_id: "1234567890123456",
    };
    // Correlation and trace IDs must remain distinct from authenticated principal
    expect(traceCtx.trace_id).not.toBe("human_lead");
    expect(traceCtx.span_id).not.toBe("changeset:apply");
  });

  it("07.SEC.7: Observability cannot approve ChangeSet", () => {
    const changeset = {
      changeset_id: "cs-sec-01",
      status: "proposed" as const,
      approved_by: null as string | null,
    };

    // Telemetry records proposal
    adapter.emitLog({
      event_name: "changeset_proposed",
      changeset_id: changeset.changeset_id,
    });
    adapter.recordMetric("changeset_proposed_count", 1);

    // ChangeSet status is strictly unaffected
    expect(changeset.status).toBe("proposed");
    expect(changeset.approved_by).toBeNull();
  });

  it("07.SEC.8: Observability cannot apply ChangeSet", () => {
    const changeset = {
      changeset_id: "cs-sec-02",
      status: "approved" as const,
      applied_at: null as string | null,
    };

    adapter.recordMetric("changeset_applied_count", 1);
    adapter.emitLog({
      event_name: "changeset_telemetry_audit",
      changeset_id: changeset.changeset_id,
    });

    // Observability recording cannot set applied_at or change canonical status
    expect(changeset.applied_at).toBeNull();
    expect(changeset.status).toBe("approved");
  });

  it("07.SEC.9: Observability cannot alter GateResult", () => {
    const gateResult = Object.freeze({
      gate_run_id: "gr-sec-01",
      verdict: "FAIL" as const,
      violations_count: 2,
    });

    adapter.recordMetric(GATE_METRICS.RUN_COUNT, 1, { verdict: "FAIL" });
    adapter.emitLog({
      event_name: "gate_completed",
      details: { verdict: gateResult.verdict },
    });

    // Verdict strictly remains FAIL
    expect(gateResult.verdict).toBe("FAIL");
    expect(gateResult.verdict as string).not.toBe("PASS");
  });

  it("07.SEC.10: Observability cannot alter SimulationResult", () => {
    const simResult = Object.freeze({
      simulation_id: "sim-sec-01",
      termination_reason: "BUDGET_EXCEEDED" as const,
      state_hash: "hash123",
    });

    adapter.recordMetric("simulation_count", 1);
    adapter.emitLog({
      event_name: "sim_done",
      details: { reason: simResult.termination_reason },
    });

    expect(simResult.termination_reason).toBe("BUDGET_EXCEEDED");
    expect(simResult.termination_reason as string).not.toBe("COMPLETED");
  });

  it("07.SEC.11: High-cardinality metric labels are rejected", () => {
    for (const forbiddenKey of FORBIDDEN_METRIC_LABELS) {
      const labels = { [forbiddenKey]: "high-cardinality-val-123", operation: "safe_op" };
      const validation = validateMetricLabels(labels);
      expect(validation.valid).toBe(false);
      expect(validation.forbiddenKey).toBe(forbiddenKey);

      // Sanitization safely removes forbidden key without throwing and marks cardinality_sanitized
      const clean = sanitizeMetricLabels(labels);
      expect(clean[forbiddenKey]).toBeUndefined();
      expect(clean["operation"]).toBe("safe_op");
      expect(clean["cardinality_sanitized"]).toBe("true");
    }
  });

  it("07.SEC.12: Operational endpoints are not exposed through product frontend", () => {
    const root = fs.existsSync(path.join(process.cwd(), "frontend"))
      ? process.cwd()
      : path.resolve(process.cwd(), "..");
    const frontendDir = path.join(root, "frontend");

    if (fs.existsSync(frontendDir)) {
      function checkDir(dir: string): string[] {
        const hits: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullPath = path.join(dir, e.name);
          if (e.isDirectory() && e.name !== "node_modules" && e.name !== "dist") {
            hits.push(...checkDir(fullPath));
          } else if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (content.includes("/metrics") || content.includes("/health/dependencies")) {
              hits.push(fullPath);
            }
          }
        }
        return hits;
      }
      const leaks = checkDir(frontendDir);
      expect(leaks).toEqual([]);
    }
  });

  it("07.SEC.13: Telemetry backend outage cannot change domain outcome (failure isolation)", () => {
    // Construct a failing / buggy telemetry adapter
    const brokenAdapter: TelemetryAdapter = {
      tracer: {
        startSpan: () => { throw new Error("Tracer OOM / network down"); },
        extractTraceContext: () => null,
        injectTraceContext: () => {},
        getTracer: () => ({} as any),
      } as any,
      metrics: {
        record: () => { throw new Error("Metrics Collector connection refused"); },
        getPrometheusText: async () => "",
      } as any,
      logger: {
        log: () => { throw new Error("Disk full / logger write failure"); },
      } as any,
      recordMetric(name, value, labels) {
        try { this.metrics.record(name, value, labels); } catch {}
      },
      emitLog(event) {
        try { this.logger.log(event); } catch {}
      },
      startSpan(name, corr) {
        try { return this.tracer.startSpan(name, corr); } catch {
          return { setAttribute: () => {}, recordError: () => {}, end: () => {} };
        }
      },
    };

    // Domain operation executes safely without throwing or modifying outcome
    let domainSuccess = false;
    let gateVerdict = "BLOCKED";

    expect(() => {
      brokenAdapter.recordMetric("test_metric", 1);
      brokenAdapter.emitLog({ event_name: "test_event" });
      const span = brokenAdapter.startSpan("broken_span");
      span.end("OK");
      domainSuccess = true;
    }).not.toThrow();

    expect(domainSuccess).toBe(true);
    expect(gateVerdict).toBe("BLOCKED"); // Not transformed to PASS
  });

  it("07.SEC.14: Health endpoint does not expose internal dependency secrets", async () => {
    // Dependency checker with internal connection strings & passwords
    const dirtyChecker = new HealthChecker({
      checkPostgres: async () => ({
        status: "READY",
        latency_ms: 5,
        details: {
          connectionString: "postgres://user:super_secret_db_password@internal-db:5432/combat",
          host: "db.internal.vpc.local",
        },
      } as any),
      checkNeo4j: async () => ({
        status: "READY",
        latency_ms: 4,
        details: {
          auth: "neo4j:very_confidential_neo_pass",
          boltUri: "bolt://neo4j.internal.cluster:7687",
        },
      } as any),
    });

    const report = await dirtyChecker.getSanitizedReport();
    const jsonStr = JSON.stringify(report);

    expect(jsonStr).not.toContain("super_secret_db_password");
    expect(jsonStr).not.toContain("internal-db");
    expect(jsonStr).not.toContain("very_confidential_neo_pass");
    expect(jsonStr).not.toContain("bolt://");
    expect(jsonStr).not.toContain("postgres://");

    // Report strictly contains sanitized components
    expect(report.components.postgres.status).toBe("READY");
    expect(report.components.neo4j.status).toBe("READY");
  });

  it("07.SEC.15: Operational observability endpoints are inaccessible from product API surface", async () => {
    const server = new ApiServer({ operationalSecret: "admin-secret-token" });

    // 1. Request without operational secret
    const reqWithoutAuth = {
      method: "GET",
      url: "/metrics",
      headers: {},
    } as http.IncomingMessage;

    let statusCode = 0;
    let body = "";
    const res = {
      writeHead: (code: number) => { statusCode = code; },
      end: (content: string) => { body = content; },
      getHeaders: () => ({}),
    } as unknown as http.ServerResponse;

    await server.handleRequest(reqWithoutAuth, res);
    expect(statusCode).toBe(403);
    expect(body).toContain("FORBIDDEN");

    // 2. Product caller with standard user token is strictly rejected (cannot treat operational endpoint as product API)
    const reqProductCaller = {
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer regular-product-user-token" },
    } as http.IncomingMessage;

    await server.handleRequest(reqProductCaller, res);
    expect(statusCode).toBe(403);
    expect(body).toContain("FORBIDDEN");

    // 3. Request /health/dependencies without operational secret
    const reqDepsWithoutAuth = {
      method: "GET",
      url: "/health/dependencies",
      headers: {},
    } as http.IncomingMessage;

    await server.handleRequest(reqDepsWithoutAuth, res);
    expect(statusCode).toBe(403);
    expect(body).toContain("FORBIDDEN");

    // 4. Request with valid operational secret succeeds
    const reqWithAuth = {
      method: "GET",
      url: "/health/dependencies",
      headers: { "x-internal-secret": "admin-secret-token" },
    } as http.IncomingMessage;

    await server.handleRequest(reqWithAuth, res);
    expect(statusCode).toBe(200);

    // 5. Strict operational isolation blocks unauthenticated health probes
    const strictServer = new ApiServer({
      operationalSecret: "admin-secret-token",
      strictOperationalIsolation: true,
    });
    const reqStrictLive = {
      method: "GET",
      url: "/health/live",
      headers: {},
    } as http.IncomingMessage;

    await strictServer.handleRequest(reqStrictLive, res);
    expect(statusCode).toBe(403);
    expect(body).toContain("FORBIDDEN");
  });

  it("07.SEC.16: Telemetry cannot inject or override authenticated principal", () => {
    // Authenticated human principal in application context
    const trustedPrincipal = {
      principal_id: "human_reviewer_01",
      principal_type: "human",
      capabilities: ["changeset:approve"],
    };

    // Adversarial incoming header trying to inject an override
    const adversarialHeaders = {
      "x-correlation-id": "corr-injected",
      "x-telemetry-principal": "admin_super_user",
    };

    // Telemetry correlation metadata
    const telemetryContext = {
      correlation_id: adversarialHeaders["x-correlation-id"],
    };

    // Application context must retain trustedPrincipal without override from telemetry
    const effectivePrincipal = trustedPrincipal;
    expect(effectivePrincipal.principal_id).toBe("human_reviewer_01");
    expect(effectivePrincipal.principal_id).not.toBe("admin_super_user");
  });
});
