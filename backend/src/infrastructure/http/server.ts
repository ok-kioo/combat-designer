import http from "node:http";
import {
  API_METRICS,
} from "../../modules/observability/domain/entity/metrics.js";
import {
  NativeTracer,
  NativeMetricsRegistry,
  StructuredLogger,
  HealthChecker,
} from "../provider/observability/index.js";
import { runIngestionPipeline } from "../provider/ingestion/pipeline.js";
import type { CanonicalSnapshotEnvelope } from "../../modules/ingestion/domain/entity/snapshot.js";

export interface WorkspaceState {
  workspace_id: string;
  has_snapshot: boolean;
  latest_revision?: string;
  latest_snapshot_hash?: string;
  latest_envelope?: CanonicalSnapshotEnvelope;
  asset_count: number;
  quarantined_count: number;
  conflicts_count: number;
  history: Array<{
    type: "simulation" | "gate_run";
    id: string;
    verdict?: string;
    created_at: string;
  }>;
}

export interface ApiServerConfig {
  port?: number;
  tracer?: NativeTracer;
  metrics?: NativeMetricsRegistry;
  logger?: StructuredLogger;
  healthChecker?: HealthChecker;
  operationalSecret?: string;
  strictOperationalIsolation?: boolean;
}

export class ApiServer {
  private readonly server: http.Server;
  public readonly port: number;
  public readonly tracer: NativeTracer;
  public readonly metrics: NativeMetricsRegistry;
  public readonly logger: StructuredLogger;
  public readonly healthChecker: HealthChecker;
  private readonly operationalSecret: string;
  public readonly strictOperationalIsolation: boolean;
  private readonly workspaceStates = new Map<string, WorkspaceState>();

  constructor(config: ApiServerConfig = {}) {
    this.port = config.port ?? 3001;
    this.tracer = config.tracer ?? new NativeTracer({ serviceName: "combat-designer-api" });
    this.metrics = config.metrics ?? new NativeMetricsRegistry("combat-designer-api");
    this.logger = config.logger ?? new StructuredLogger({ silent: true });
    this.healthChecker = config.healthChecker ?? new HealthChecker();
    this.operationalSecret = config.operationalSecret ?? "ops-internal-token-secret";
    this.strictOperationalIsolation = config.strictOperationalIsolation ?? false;

    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  public getWorkspaceState(workspaceId: string): WorkspaceState {
    const existing = this.workspaceStates.get(workspaceId);
    if (existing) return existing;
    const initial: WorkspaceState = {
      workspace_id: workspaceId,
      has_snapshot: false,
      asset_count: 0,
      quarantined_count: 0,
      conflicts_count: 0,
      history: [],
    };
    this.workspaceStates.set(workspaceId, initial);
    return initial;
  }

  public recordGateRun(workspaceId: string, id: string, verdict: string): void {
    const state = this.getWorkspaceState(workspaceId);
    state.history.unshift({
      type: "gate_run",
      id,
      verdict,
      created_at: new Date().toISOString(),
    });
  }

  public recordSimulation(workspaceId: string, id: string): void {
    const state = this.getWorkspaceState(workspaceId);
    state.history.unshift({
      type: "simulation",
      id,
      created_at: new Date().toISOString(),
    });
  }

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  public isAuthorizedForOperational(req: http.IncomingMessage): boolean {
    const authHeader = req.headers["authorization"];
    const secretHeader = req.headers["x-internal-secret"] ?? req.headers["x-operational-secret"];
    const boundaryHeader = req.headers["x-operational-boundary"];

    // Product tokens, arbitrary bearer headers, or missing headers MUST NOT pass the operational barrier
    if (secretHeader && secretHeader === this.operationalSecret) {
      return true;
    }

    if (authHeader && authHeader === `Bearer ${this.operationalSecret}`) {
      return true;
    }

    if (boundaryHeader === "internal" && secretHeader === this.operationalSecret) {
      return true;
    }

    return false;
  }

  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];

    // Extract W3C Trace Context
    const traceCtx = this.tracer.extractTraceContext(req.headers as Record<string, string | undefined>);
    const requestId = (req.headers["x-request-id"] as string) || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = (req.headers["x-correlation-id"] as string) || requestId;

    // Attach traceparent to response if trace context is present
    if (traceCtx) {
      this.tracer.injectTraceContext(traceCtx, res.getHeaders() as Record<string, string>);
    }

    const span = this.tracer.startSpan(`http_${method.toLowerCase()}_${pathname}`, {
      correlation_id: correlationId,
    });
    span.setAttribute("http.request_id", requestId);


    const finish = (statusCode: number, body: string, contentType = "application/json"): void => {
      const durationMs = Date.now() - startTime;
      this.metrics.record(API_METRICS.REQUEST_COUNT, 1, {
        status: String(statusCode),
        operation: pathname,
      });
      this.metrics.record(API_METRICS.REQUEST_LATENCY_MS, durationMs, {
        operation: pathname,
      });

      if (statusCode >= 400) {
        this.metrics.record(API_METRICS.REQUEST_ERROR_COUNT, 1, {
          status: String(statusCode),
          operation: pathname,
        });
        span.recordError(new Error(`HTTP ${statusCode}`));
        span.end("ERROR");
      } else {
        span.end("OK");
      }

      this.logger.log({
        event_name: "http_request_finished",
        correlation_id: correlationId,
        request_id: requestId,
        operation: `${method} ${pathname}`,
        status: statusCode >= 400 ? "ERROR" : "SUCCESS",
        duration_ms: durationMs,
        details: { status_code: statusCode, path: pathname },
      });

      res.writeHead(statusCode, { "Content-Type": contentType });
      res.end(body);
    };

    try {
      // If strict operational isolation is configured, ALL /health/* and /metrics routes require operational credentials
      if (this.strictOperationalIsolation && (pathname.startsWith("/health") || pathname === "/metrics")) {
        if (!this.isAuthorizedForOperational(req)) {
          return finish(403, JSON.stringify({
            error: "FORBIDDEN",
            message: "Operational isolation boundary enforced: Access denied for non-operational caller",
          }));
        }
      }

      // 1. Liveness endpoint: /health/live and /health (Docker Compose compatible)
      if (method === "GET" && (pathname === "/health/live" || pathname === "/health")) {
        const isLive = await this.healthChecker.checkLiveness();
        return finish(isLive ? 200 : 503, JSON.stringify({ status: isLive ? "LIVE" : "UNHEALTHY" }));
      }

      // 2. Readiness endpoint: /health/ready
      if (method === "GET" && pathname === "/health/ready") {
        const isReady = await this.healthChecker.checkReadiness();
        return finish(isReady ? 200 : 503, JSON.stringify({ status: isReady ? "READY" : "UNHEALTHY" }));
      }

      // 3. Operational Dependency Health: /health/dependencies
      // Protected by explicit operational boundary
      if (method === "GET" && pathname === "/health/dependencies") {
        if (!this.isAuthorizedForOperational(req)) {
          return finish(403, JSON.stringify({
            error: "FORBIDDEN",
            message: "Operational endpoint access denied: Operational barrier enforced",
          }));
        }

        const report = await this.healthChecker.getSanitizedReport();
        const statusCode = report.status === "UNHEALTHY" ? 503 : 200;
        return finish(statusCode, JSON.stringify(report));
      }

      // 4. Operational Metrics endpoint: /metrics (Prometheus exposition format)
      // Protected by explicit operational boundary
      if (method === "GET" && pathname === "/metrics") {
        if (!this.isAuthorizedForOperational(req)) {
          return finish(403, JSON.stringify({
            error: "FORBIDDEN",
            message: "Operational endpoint access denied: Operational barrier enforced",
          }));
        }

        const metricsText = await this.metrics.getPrometheusText();
        return finish(200, metricsText, "text/plain; version=0.0.4; charset=utf-8");
      }

      // 5. Ingestion Delivery: POST /api/workspaces/:workspace_id/bundles
      const bundleMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/bundles\/?$/);
      if (method === "POST" && bundleMatch) {
        const workspaceId = decodeURIComponent(bundleMatch[1]);

        // Workspace authorization check
        const authorizedWorkspacesHeader = req.headers["x-authorized-workspaces"];
        if (authorizedWorkspacesHeader !== undefined) {
          const allowed = String(authorizedWorkspacesHeader)
            .split(",")
            .map((s) => s.trim());
          if (!allowed.includes(workspaceId) && !allowed.includes("*")) {
            return finish(
              403,
              JSON.stringify({
                error: "FORBIDDEN",
                message: `Principal not authorized for workspace '${workspaceId}'`,
              })
            );
          }
        }

        const rawBody = await this.readRequestBody(req);
        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return finish(
            400,
            JSON.stringify({
              error: "INVALID_JSON",
              message: "Malformed JSON payload in request body",
            })
          );
        }

        if (!payload || !payload.manifest) {
          return finish(
            400,
            JSON.stringify({
              error: "MISSING_MANIFEST",
              message: "Upload bundle must include a valid manifest",
            })
          );
        }

        if (payload.manifest.workspace_id !== workspaceId) {
          return finish(
            400,
            JSON.stringify({
              error: "WORKSPACE_MISMATCH",
              message: `Manifest workspace_id '${payload.manifest.workspace_id}' does not match route workspace '${workspaceId}'`,
            })
          );
        }

        const filesMap = new Map<string, string | Buffer>();
        if (payload.files && typeof payload.files === "object") {
          for (const [k, v] of Object.entries(payload.files)) {
            filesMap.set(k, typeof v === "string" ? v : JSON.stringify(v));
          }
        }

        const result = runIngestionPipeline(payload.manifest, filesMap, {
          authorizedWorkspaceId: workspaceId,
        });

        if (!result.success || result.envelope.conflicts.length > 0) {
          const firstConflict = result.envelope.conflicts[0];
          const conflictType = firstConflict?.conflict_type || "validation_error";
          const statusCode =
            conflictType === "version_mismatch" ||
            conflictType === "unsupported_format" ||
            conflictType === "checksum_mismatch"
              ? 409
              : 400;
          return finish(
            statusCode,
            JSON.stringify({
              status: "CONFLICT",
              conflict_type: conflictType,
              details: firstConflict?.details || "Bundle ingestion conflict",
              conflicts: result.envelope.conflicts,
            })
          );
        }

        const state: WorkspaceState = {
          workspace_id: workspaceId,
          has_snapshot: true,
          latest_revision: result.envelope.revision,
          latest_snapshot_hash: result.envelope.snapshot_hash,
          latest_envelope: result.envelope,
          asset_count: result.envelope.canonical_snapshot.attacks.length,
          quarantined_count: result.envelope.quarantined.length,
          conflicts_count: result.envelope.conflicts.length,
          history: this.getWorkspaceState(workspaceId).history || [],
        };
        this.workspaceStates.set(workspaceId, state);

        return finish(
          201,
          JSON.stringify({
            status: "SUCCESS",
            workspace_id: workspaceId,
            project_id: result.envelope.project_id,
            revision: result.envelope.revision,
            snapshot_hash: result.envelope.snapshot_hash,
            asset_count: result.envelope.canonical_snapshot.attacks.length,
            quarantined_count: result.envelope.quarantined.length,
            conflicts_count: result.envelope.conflicts.length,
            summary: {
              processed: result.envelope.canonical_snapshot.attacks.length,
              quarantined: result.envelope.quarantined.length,
              conflicts: result.envelope.conflicts.length,
            },
          })
        );
      }

      // 6. Ingestion Workspace Status: GET /api/workspaces/:workspace_id/status
      const statusMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/status\/?$/);
      if (method === "GET" && statusMatch) {
        const workspaceId = decodeURIComponent(statusMatch[1]);

        // Workspace authorization check
        const authorizedWorkspacesHeader = req.headers["x-authorized-workspaces"];
        if (authorizedWorkspacesHeader !== undefined) {
          const allowed = String(authorizedWorkspacesHeader)
            .split(",")
            .map((s) => s.trim());
          if (!allowed.includes(workspaceId) && !allowed.includes("*")) {
            return finish(
              403,
              JSON.stringify({
                error: "FORBIDDEN",
                message: `Principal not authorized for workspace '${workspaceId}'`,
              })
            );
          }
        }

        const state = this.getWorkspaceState(workspaceId);
        return finish(200, JSON.stringify(state));
      }

      // Not Found
      return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Route ${pathname} not found` }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return finish(500, JSON.stringify({ error: "INTERNAL_ERROR", message }));
    }
  }

  public listen(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => resolve());
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  public getHttpServer(): http.Server {
    return this.server;
  }
}
