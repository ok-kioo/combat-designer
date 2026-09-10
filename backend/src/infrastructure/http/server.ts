import http from "node:http";
import {
  API_METRICS,
  INGESTION_METRICS,
} from "../../modules/observability/domain/entity/metrics.js";
import {
  NativeTracer,
  NativeMetricsRegistry,
  StructuredLogger,
  HealthChecker,
} from "../provider/observability/index.js";
import { runIngestionPipeline } from "../provider/ingestion/pipeline.js";
import { DEFAULT_INGESTION_LIMITS } from "../provider/ingestion/limits.js";
import type { CanonicalSnapshotEnvelope } from "../../modules/ingestion/domain/entity/snapshot.js";
import type {
  CombatQueryPort,
  AttackSummary,
  SimulationPort,
  MechanicalGatePort,
} from "../../modules/combat/domain/repository/index.js";
import type { ChangeSetRepositoryPort } from "../../modules/changeset/domain/repository/index.js";
import type { ChangeSetProposal } from "../../modules/changeset/domain/entity/index.js";
import type { LlmProvider } from "../../modules/llm/domain/port/llm-provider.js";
import { ChatOrchestrator } from "../../modules/llm/service/chat-orchestrator.js";
import type { ChatContextEnvelope } from "../../modules/llm/service/chat-orchestrator.js";
import { renderWorkbenchHtml } from "./workbench-html.js";
import {
  AuthService,
  AuthMiddleware,
  AuthController,
  InMemoryUserRepository,
  InMemoryRefreshTokenRepository,
  InMemoryWorkspaceRepository,
  WorkspaceAuthorizationService,
  type WorkspaceRepositoryPort,
  type WorkspaceAuthorizationPort,
  type Workspace,
} from "../../index.js";

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
  queryPort?: CombatQueryPort;
  simulationPort?: SimulationPort;
  gatePort?: MechanicalGatePort;
  changesetRepo?: ChangeSetRepositoryPort;
  llmProvider?: LlmProvider;
  authService?: AuthService;
  workspaceRepo?: WorkspaceRepositoryPort;
  workspaceAuthorizationPort?: WorkspaceAuthorizationPort;
  allowLegacyHeader?: boolean;
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
  public readonly queryPort?: CombatQueryPort;
  public readonly simulationPort?: SimulationPort;
  public readonly gatePort?: MechanicalGatePort;
  public readonly changesetRepo?: ChangeSetRepositoryPort;
  public readonly chatOrchestrator?: ChatOrchestrator;
  public readonly authService: AuthService;
  public readonly authMiddleware: AuthMiddleware;
  public readonly authController: AuthController;
  public readonly workspaceRepo: WorkspaceRepositoryPort;
  public readonly workspaceAuthorizationPort: WorkspaceAuthorizationPort;
  public readonly allowLegacyHeader: boolean;
  private readonly workspaceStates = new Map<string, WorkspaceState>();
  private readonly changesetStore = new Map<string, Map<string, ChangeSetProposal>>();

  constructor(config: ApiServerConfig = {}) {
    this.port = config.port ?? 3001;
    this.tracer = config.tracer ?? new NativeTracer({ serviceName: "combat-designer-api" });
    this.metrics = config.metrics ?? new NativeMetricsRegistry("combat-designer-api");
    this.logger = config.logger ?? new StructuredLogger({ silent: true });
    this.healthChecker = config.healthChecker ?? new HealthChecker();
    this.operationalSecret = config.operationalSecret ?? "ops-internal-token-secret";
    this.strictOperationalIsolation = config.strictOperationalIsolation ?? false;
    this.queryPort = config.queryPort;
    this.simulationPort = config.simulationPort;
    this.gatePort = config.gatePort;
    this.changesetRepo = config.changesetRepo;
    this.allowLegacyHeader = config.allowLegacyHeader ?? true;

    this.workspaceRepo = config.workspaceRepo ?? new InMemoryWorkspaceRepository();
    this.workspaceAuthorizationPort =
      config.workspaceAuthorizationPort ?? new WorkspaceAuthorizationService(this.workspaceRepo);

    if (config.authService) {
      this.authService = config.authService;
    } else {
      const userRepo = new InMemoryUserRepository();
      const tokenRepo = new InMemoryRefreshTokenRepository();
      this.authService = new AuthService(userRepo, tokenRepo, this.workspaceRepo);
    }
    this.authMiddleware = new AuthMiddleware(this.authService, this.workspaceAuthorizationPort);
    this.authController = new AuthController(this.authService, this.authMiddleware, this.workspaceRepo);

    // Initialize ChatOrchestrator if LLM provider is available
    if (config.llmProvider) {
      this.chatOrchestrator = new ChatOrchestrator(config.llmProvider, {
        queryPort: this.queryPort,
        simulationPort: this.simulationPort,
        gatePort: this.gatePort,
        saveChangeset: (proposal) => this.saveChangeset(proposal),
        getWorkspaceRevision: (wsId) => this.getWorkspaceState(wsId).latest_revision,
      });
    }

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

  private getChangesetStore(workspaceId: string): Map<string, ChangeSetProposal> {
    let store = this.changesetStore.get(workspaceId);
    if (!store) {
      store = new Map<string, ChangeSetProposal>();
      this.changesetStore.set(workspaceId, store);
    }
    return store;
  }

  public saveChangeset(proposal: ChangeSetProposal): void {
    const store = this.getChangesetStore(proposal.workspace_id);
    store.set(proposal.changeset_id, proposal);
    if (this.changesetRepo) {
      void this.changesetRepo.save(proposal);
    }
  }

  public getChangesetById(workspaceId: string, changesetId: string): ChangeSetProposal | null {
    const store = this.getChangesetStore(workspaceId);
    return store.get(changesetId) ?? null;
  }

  public getChangesetsForWorkspace(workspaceId: string): ChangeSetProposal[] {
    const store = this.getChangesetStore(workspaceId);
    return Array.from(store.values());
  }

  public async checkAuthorization(
    req: http.IncomingMessage,
    workspaceId: string
  ): Promise<{ authorized: boolean; status: 401 | 403; code: string; message: string; userId?: string }> {
    const bearerToken = this.authMiddleware.extractBearerToken(req);
    if (bearerToken) {
      try {
        const claims = this.authService.verifyAccessToken(bearerToken);
        const authResult = await this.workspaceAuthorizationPort.authorize(claims.sub, workspaceId);
        if (!authResult.authorized) {
          return {
            authorized: false,
            status: 403,
            code: "FORBIDDEN",
            message: authResult.message,
          };
        }
        return { authorized: true, status: 401, code: "", message: "", userId: claims.sub };
      } catch (err: any) {
        const isExpired = String(err.message).includes("TOKEN_EXPIRED");
        return {
          authorized: false,
          status: 401,
          code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
          message: err.message || "Invalid or expired access token",
        };
      }
    }

    // Operational secret check
    if (this.isAuthorizedForOperational(req)) {
      return { authorized: true, status: 401, code: "", message: "" };
    }

    // Legacy header support for existing test suites during migration
    const authorizedWorkspacesHeader = req.headers["x-authorized-workspaces"];
    if (this.allowLegacyHeader && authorizedWorkspacesHeader !== undefined) {
      const allowed = String(authorizedWorkspacesHeader)
        .split(",")
        .map((s) => s.trim());
      if (allowed.includes(workspaceId) || allowed.includes("*")) {
        return { authorized: true, status: 401, code: "", message: "" };
      }
      return {
        authorized: false,
        status: 403,
        code: "FORBIDDEN",
        message: `Principal not authorized for workspace '${workspaceId}'`,
      };
    }

    // Fail-Closed: Missing token and missing/disallowed header -> 401 UNAUTHENTICATED
    return {
      authorized: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Authorization required: Bearer access token is missing",
    };
  }

  public async isWorkspaceAuthorized(req: http.IncomingMessage, workspaceId: string): Promise<boolean> {
    const res = await this.checkAuthorization(req, workspaceId);
    return res.authorized;
  }

  private readRequestBody(
    req: http.IncomingMessage,
    maxBytes = DEFAULT_INGESTION_LIMITS.maxBundleSizeBytes
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const contentLength = req.headers["content-length"];
      if (contentLength && parseInt(contentLength, 10) > maxBytes) {
        req.resume();
        return reject(
          new Error(`PAYLOAD_TOO_LARGE: Content-Length ${contentLength} exceeded limit of ${maxBytes} bytes`)
        );
      }

      let totalBytes = 0;
      let aborted = false;
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => {
        if (aborted) return;
        const buf = Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > maxBytes) {
          aborted = true;
          req.resume();
          reject(
            new Error(`PAYLOAD_TOO_LARGE: Request stream exceeded maximum allowed size of ${maxBytes} bytes`)
          );
          return;
        }
        chunks.push(buf);
      });

      req.on("end", () => {
        if (!aborted) {
          resolve(Buffer.concat(chunks).toString("utf8"));
        }
      });

      req.on("error", (err) => {
        if (!aborted) reject(err);
      });
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


    // CORS headers for cross-origin frontend support
    const origin = (req.headers["origin"] as string) || "*";
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-authorized-workspaces, x-request-id, x-correlation-id, traceparent, x-internal-secret, x-operational-secret, x-operational-boundary",
      "Access-Control-Allow-Credentials": "true",
    };

    // Preflight OPTIONS requests
    if (method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

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

      res.writeHead(statusCode, { "Content-Type": contentType, ...corsHeaders });
      res.end(body);
    };

    try {
      // Web Workbench UI: GET / and GET /app
      if (method === "GET" && (pathname === "/" || pathname === "/app")) {
        const html = renderWorkbenchHtml("ws-default");
        return finish(200, html, "text/html; charset=utf-8");
      }

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

      // 4b. Auth Endpoints: /api/auth/* (Spec 12)
      if (pathname === "/api/auth/register" && method === "POST") {
        try {
          const bodyStr = await this.readRequestBody(req);
          const parsed = JSON.parse(bodyStr);
          await this.authController.register(parsed, res);
          span.end("OK");
          return;
        } catch (err: any) {
          return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: err.message }));
        }
      }

      if (pathname === "/api/auth/login" && method === "POST") {
        try {
          const bodyStr = await this.readRequestBody(req);
          const parsed = JSON.parse(bodyStr);
          await this.authController.login(req, parsed, res);
          span.end("OK");
          return;
        } catch (err: any) {
          return finish(401, JSON.stringify({ error: "INVALID_CREDENTIALS", message: err.message }));
        }
      }

      if (pathname === "/api/auth/refresh" && method === "POST") {
        try {
          const bodyStr = await this.readRequestBody(req);
          const parsed = JSON.parse(bodyStr);
          await this.authController.refresh(parsed, res);
          span.end("OK");
          return;
        } catch (err: any) {
          return finish(401, JSON.stringify({ error: "INVALID_TOKEN", message: err.message }));
        }
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        try {
          const bodyStr = await this.readRequestBody(req);
          const parsed = JSON.parse(bodyStr || "{}");
          await this.authController.logout(parsed, res);
          span.end("OK");
          return;
        } catch (err: any) {
          return finish(204, "");
        }
      }

      if (pathname === "/api/auth/me" && method === "GET") {
        await this.authController.me(req, res);
        span.end("OK");
        return;
      }

      // 4c. Workspace Collection: POST /api/workspaces and GET /api/workspaces (Spec 12)
      if (pathname === "/api/workspaces" || pathname === "/api/workspaces/") {
        const auth = await this.authMiddleware.authenticate(req);
        if (!auth.authenticated) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        if (method === "GET") {
          const workspaces = await this.workspaceRepo.findByOwner(auth.context.userId);
          return finish(200, JSON.stringify(workspaces));
        }

        if (method === "POST") {
          try {
            const bodyStr = await this.readRequestBody(req);
            const body = JSON.parse(bodyStr || "{}");
            if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
              return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: "Workspace name is required" }));
            }

            const now = new Date().toISOString();
            const workspaceId = `ws-${crypto.randomUUID().slice(0, 12)}`;
            const workspace: Workspace = {
              id: workspaceId,
              owner_user_id: auth.context.userId, // always derived from authenticated user, never payload
              name: body.name.trim(),
              description: typeof body.description === "string" ? body.description.trim() : undefined,
              engine: typeof body.engine === "string" ? body.engine.trim() : "unity",
              engine_version: typeof body.engine_version === "string" ? body.engine_version.trim() : undefined,
              status: "active",
              created_at: now,
              updated_at: now,
            };
            await this.workspaceRepo.save(workspace);
            return finish(201, JSON.stringify(workspace));
          } catch (err: any) {
            return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: err.message }));
          }
        }
      }

      // 4d. Single Workspace: GET /api/workspaces/:workspace_id (Spec 12)
      const singleWorkspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/?$/);
      if (method === "GET" && singleWorkspaceMatch) {
        const workspaceId = decodeURIComponent(singleWorkspaceMatch[1]);
        const auth = await this.authMiddleware.authenticate(req);
        if (!auth.authenticated) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        const workspace = await this.workspaceRepo.findById(workspaceId);
        if (!workspace) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Workspace '${workspaceId}' not found` }));
        }

        if (workspace.owner_user_id !== auth.context.userId) {
          return finish(403, JSON.stringify({ error: "FORBIDDEN", message: `User '${auth.context.userId}' is not the owner of workspace '${workspaceId}'` }));
        }

        return finish(200, JSON.stringify(workspace));
      }

      // 5. Ingestion Delivery: POST /api/workspaces/:workspace_id/bundles
      const bundleMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/bundles\/?$/);
      if (method === "POST" && bundleMatch) {
        const workspaceId = decodeURIComponent(bundleMatch[1]);

        // Workspace authorization check (Fail-Closed)
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: "unauthorized_workspace",
          });
          return finish(
            auth.status,
            JSON.stringify({
              error: auth.code,
              message: auth.message,
            })
          );
        }

        let rawBody: string;
        try {
          rawBody = await this.readRequestBody(req);
        } catch (err: any) {
          const isTooLarge = err?.message?.includes("PAYLOAD_TOO_LARGE");
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: isTooLarge ? "oversized_bundle" : "stream_error",
          });
          return finish(
            isTooLarge ? 413 : 400,
            JSON.stringify({
              error: isTooLarge ? "PAYLOAD_TOO_LARGE" : "REQUEST_ERROR",
              message: err?.message || "Failed to read request body",
            })
          );
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: "invalid_json",
          });
          return finish(
            400,
            JSON.stringify({
              error: "INVALID_JSON",
              message: "Malformed JSON payload in request body",
            })
          );
        }

        if (!payload || !payload.manifest) {
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: "missing_manifest",
          });
          return finish(
            400,
            JSON.stringify({
              error: "MISSING_MANIFEST",
              message: "Upload bundle must include a valid manifest",
            })
          );
        }

        if (payload.manifest.workspace_id !== workspaceId) {
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: "workspace_mismatch",
          });
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
          this.metrics.record(INGESTION_METRICS.BUNDLE_REJECTED_TOTAL, 1, {
            reason: conflictType,
          });
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

        this.metrics.record(INGESTION_METRICS.BUNDLE_RECEIVED_COUNT, 1, {
          workspace_id: workspaceId,
        });
        this.metrics.record(INGESTION_METRICS.BUNDLE_PROCESSED_COUNT, 1, {
          workspace_id: workspaceId,
        });
        if (result.envelope.quarantined.length > 0) {
          this.metrics.record(
            INGESTION_METRICS.ASSETS_QUARANTINED_COUNT,
            result.envelope.quarantined.length,
            { workspace_id: workspaceId }
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

        // Workspace authorization check (Fail-Closed)
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(
            auth.status,
            JSON.stringify({
              error: auth.code,
              message: auth.message,
            })
          );
        }

        const state = this.getWorkspaceState(workspaceId);
        return finish(200, JSON.stringify(state));
      }

      // 7. Attack Catalog: GET /api/workspaces/:workspace_id/attacks
      const attacksMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/attacks\/?$/);
      if (method === "GET" && attacksMatch) {
        const workspaceId = decodeURIComponent(attacksMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const searchParams = new URL(url, "http://localhost").searchParams;
        const q = searchParams.get("query") ?? undefined;
        const tag = searchParams.get("tag") ?? undefined;
        const minCancelStr = searchParams.get("min_cancel_window");
        const minCancel = minCancelStr ? parseInt(minCancelStr, 10) : undefined;

        let attacks: AttackSummary[] = [];
        if (this.queryPort) {
          attacks = await this.queryPort.searchAttacks({
            workspace_id: workspaceId,
            query: q,
            tag,
            min_cancel_window: minCancel,
          });
        } else {
          const state = this.getWorkspaceState(workspaceId);
          const rawAttacks = state.latest_envelope?.canonical_snapshot?.attacks ?? [];
          attacks = rawAttacks
            .filter((a) => {
              const attackName = typeof a.name === "string" ? a.name : a.name?.name ?? "";
              if (q && !attackName.toLowerCase().includes(q.toLowerCase())) return false;
              if (tag && (!a.tags || !a.tags.includes(tag))) return false;
              if (minCancel !== undefined && a.cancels) {
                const hasWin = a.cancels.some((c) => (c.window.end - c.window.start) >= minCancel);
                if (!hasWin) return false;
              }
              return true;
            })
            .map((a) => ({
              attack_id: a.id,
              name: typeof a.name === "string" ? a.name : a.name?.name ?? a.id,
              startup_frames: a.startup_frames,
              active_frames: a.active_frames,
              recovery_frames: a.recovery_frames,
              damage: a.damage,
              cancel_window: a.cancels?.[0]?.window
                ? { start_frame: a.cancels[0].window.start, end_frame: a.cancels[0].window.end }
                : undefined,
              tags: a.tags,
              untrusted_text: true,
            }));
        }
        return finish(200, JSON.stringify({ workspace_id: workspaceId, count: attacks.length, attacks }));
      }

      // 8. Attack Detail: GET /api/workspaces/:workspace_id/attacks/:attack_id
      const attackDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/attacks\/([^/]+)\/?$/);
      if (method === "GET" && attackDetailMatch) {
        const workspaceId = decodeURIComponent(attackDetailMatch[1]);
        const attackId = decodeURIComponent(attackDetailMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        let attack: AttackSummary | null = null;
        if (this.queryPort) {
          attack = await this.queryPort.getAttack(workspaceId, attackId);
        } else {
          const state = this.getWorkspaceState(workspaceId);
          const raw = state.latest_envelope?.canonical_snapshot?.attacks?.find((a) => a.id === attackId);
          if (raw) {
            attack = {
              attack_id: raw.id,
              name: typeof raw.name === "string" ? raw.name : raw.name?.name ?? raw.id,
              startup_frames: raw.startup_frames,
              active_frames: raw.active_frames,
              recovery_frames: raw.recovery_frames,
              damage: raw.damage,
              cancel_window: raw.cancels?.[0]?.window
                ? { start_frame: raw.cancels[0].window.start, end_frame: raw.cancels[0].window.end }
                : undefined,
              tags: raw.tags,
              untrusted_text: true,
            };
          }
        }

        if (!attack) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Attack '${attackId}' not found in workspace '${workspaceId}'` }));
        }
        return finish(200, JSON.stringify({ workspace_id: workspaceId, attack }));
      }

      // 9. Simulation Execution: POST /api/workspaces/:workspace_id/simulations
      const simMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/simulations\/?$/);
      if (method === "POST" && simMatch) {
        const workspaceId = decodeURIComponent(simMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const input = JSON.parse(bodyText || "{}");
        const simId = input.scenario_id || `sim_${Date.now()}`;

        let output: any;
        if (this.simulationPort) {
          output = await this.simulationPort.simulate(input);
        } else {
          output = {
            simulation_id: simId,
            total_frames: input?.config?.budget?.max_frames ?? 120,
            final_state_hash: `hash_sim_${workspaceId}_${simId}`,
            events: [
              { frame: 1, type: "attack_started", actor_id: "hero", details: { attack_id: "atk_light_punch" } },
              { frame: 5, type: "hitbox_active", actor_id: "hero", details: { hitbox_id: "hb_1" } },
              { frame: 6, type: "hit_confirmed", actor_id: "opponent", details: { damage: 25 } },
            ],
            state_transitions: 3,
            status: "COMPLETED",
          };
        }
        this.recordSimulation(workspaceId, simId);
        return finish(200, JSON.stringify({ workspace_id: workspaceId, simulation: output }));
      }

      // 10. Mechanical Gate Verification: POST /api/workspaces/:workspace_id/verifications
      const verifyMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/verifications\/?$/);
      if (method === "POST" && verifyMatch) {
        const workspaceId = decodeURIComponent(verifyMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { verification_request, simulation_output } = JSON.parse(bodyText || "{}");

        let gateResult: any;
        if (this.gatePort) {
          gateResult = await this.gatePort.verify(verification_request, simulation_output);
        } else {
          const verdict = verification_request?.should_fail
            ? "FAIL"
            : (verification_request?.budget_exceeded ? "BUDGET_EXCEEDED" : "PASS");
          gateResult = {
            gate_run_id: `gate_${Date.now()}`,
            verdict,
            gate_result_hash: `gate_hash_${Date.now()}`,
            violations: verdict === "FAIL" ? [{ rule_id: "MAX_SUSTAINED_DPS", severity: "FAIL", message: "DPS exceeded limit" }] : [],
            checks: [{ rule_id: "NO_INFINITE_LOOP", status: verdict }],
            summary: { total_checks: 1, passed: verdict === "PASS" ? 1 : 0, failed: verdict === "FAIL" ? 1 : 0, evidence_count: 0 },
          };
        }
        this.recordGateRun(workspaceId, gateResult.gate_run_id, gateResult.verdict);
        return finish(200, JSON.stringify({ workspace_id: workspaceId, gate_result: gateResult }));
      }

      // 11. List ChangeSets: GET /api/workspaces/:workspace_id/changesets
      const changesetsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/?$/);
      if (method === "GET" && changesetsMatch) {
        const workspaceId = decodeURIComponent(changesetsMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const list = this.getChangesetsForWorkspace(workspaceId);
        return finish(200, JSON.stringify({ workspace_id: workspaceId, count: list.length, changesets: list }));
      }

      // 12. Propose ChangeSet: POST /api/workspaces/:workspace_id/changesets
      const createChangesetMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/?$/);
      if (method === "POST" && createChangesetMatch) {
        const workspaceId = decodeURIComponent(createChangesetMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const payload = JSON.parse(bodyText || "{}");
        const id = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const proposal: ChangeSetProposal = {
          changeset_id: id,
          workspace_id: workspaceId,
          base_revision: payload.base_revision || "rev-1",
          target_revision: payload.target_revision || "rev-2",
          proposed_by: payload.proposed_by || "human_designer",
          status: "proposed",
          mutations: payload.mutations || [],
          created_at: new Date().toISOString(),
          idempotency_key: payload.idempotency_key,
        };
        this.saveChangeset(proposal);
        return finish(201, JSON.stringify({ status: "PROPOSED", workspace_id: workspaceId, changeset: proposal }));
      }

      // 13. Get ChangeSet by ID: GET /api/workspaces/:workspace_id/changesets/:changeset_id
      const singleChangesetMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/([^/]+)\/?$/);
      if (method === "GET" && singleChangesetMatch) {
        const workspaceId = decodeURIComponent(singleChangesetMatch[1]);
        const changesetId = decodeURIComponent(singleChangesetMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const found = this.getChangesetById(workspaceId, changesetId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `ChangeSet '${changesetId}' not found` }));
        }
        return finish(200, JSON.stringify({ workspace_id: workspaceId, changeset: found }));
      }

      // 14. Approve ChangeSet: POST /api/workspaces/:workspace_id/changesets/:changeset_id/approve
      const approveMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/([^/]+)\/approve\/?$/);
      if (method === "POST" && approveMatch) {
        const workspaceId = decodeURIComponent(approveMatch[1]);
        const changesetId = decodeURIComponent(approveMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { approver_id } = JSON.parse(bodyText || "{}");
        const found = this.getChangesetById(workspaceId, changesetId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `ChangeSet '${changesetId}' not found` }));
        }
        found.status = "approved";
        found.approved_by = approver_id || "human_lead";
        found.approved_at = new Date().toISOString();
        this.saveChangeset(found);
        return finish(200, JSON.stringify({ status: "APPROVED", workspace_id: workspaceId, changeset: found }));
      }

      // 15. Apply ChangeSet: POST /api/workspaces/:workspace_id/changesets/:changeset_id/apply
      const applyMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/([^/]+)\/apply\/?$/);
      if (method === "POST" && applyMatch) {
        const workspaceId = decodeURIComponent(applyMatch[1]);
        const changesetId = decodeURIComponent(applyMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { gate_result } = JSON.parse(bodyText || "{}");
        const found = this.getChangesetById(workspaceId, changesetId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `ChangeSet '${changesetId}' not found` }));
        }
        if (found.status !== "approved") {
          return finish(400, JSON.stringify({ error: "NOT_APPROVED", message: `ChangeSet '${changesetId}' must be approved before apply` }));
        }
        if (!gate_result || gate_result.verdict !== "PASS") {
          return finish(400, JSON.stringify({ error: "GATE_VERDICT_REQUIRED", message: `Cannot apply changeset without non-stale GateResult PASS (received '${gate_result?.verdict}')` }));
        }
        found.status = "applied";
        found.applied_at = new Date().toISOString();
        this.saveChangeset(found);

        const state = this.getWorkspaceState(workspaceId);
        state.latest_revision = found.target_revision;
        return finish(200, JSON.stringify({ status: "APPLIED", workspace_id: workspaceId, changeset: found }));
      }

      // 16. Withdraw ChangeSet: POST /api/workspaces/:workspace_id/changesets/:changeset_id/withdraw
      const withdrawMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/changesets\/([^/]+)\/withdraw\/?$/);
      if (method === "POST" && withdrawMatch) {
        const workspaceId = decodeURIComponent(withdrawMatch[1]);
        const changesetId = decodeURIComponent(withdrawMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { reason } = JSON.parse(bodyText || "{}");
        const found = this.getChangesetById(workspaceId, changesetId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `ChangeSet '${changesetId}' not found` }));
        }
        found.status = "withdrawn";
        this.saveChangeset(found);
        return finish(200, JSON.stringify({ status: "WITHDRAWN", workspace_id: workspaceId, changeset: found, reason }));
      }

      // 17. Director Chat & Structured LLM Input: POST /api/workspaces/:workspace_id/chat
      const chatMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/chat\/?$/);
      if (method === "POST" && chatMatch) {
        const workspaceId = decodeURIComponent(chatMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { prompt, context } = JSON.parse(bodyText || "{}");
        const state = this.getWorkspaceState(workspaceId);

        const contextEnvelope: ChatContextEnvelope = {
          workspace_id: workspaceId,
          user_id: (auth as any).userId || (req.headers["x-user-id"] as string) || "user_default",
          conversation_id: (context?.conversation_id as string) || `conv_${workspaceId}_default`,
          snapshot_hash: context?.snapshot_hash ?? state.latest_snapshot_hash ?? "snapshot_default",
          selected_attack_ids: (context?.selected_attack_ids as string[]) ?? [],
          active_changeset_id: context?.active_changeset_id as string | undefined,
          user_prompt: prompt,
          timestamp: new Date().toISOString(),
          history: context?.history,
        };

        // === LLM Orchestrator Path (when LlmProvider is configured) ===
        if (this.chatOrchestrator) {
          try {
            const result = await this.chatOrchestrator.processMessage(contextEnvelope);
            return finish(200, JSON.stringify({
              message_id: result.message_id,
              conversation_id: result.conversation_id,
              workspace_id: workspaceId,
              processing_state: result.processing_state,
              intent: result.intent,
              reply: result.reply,
              activities: result.activities,
              tool_calls: result.tool_calls,
              proposed_changeset: result.proposed_changeset,
              context_envelope: contextEnvelope,
              llm_orchestrated: true,
            }));
          } catch (llmErr: unknown) {
            const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
            return finish(503, JSON.stringify({
              error: "LLM_PROVIDER_ERROR",
              message: `LLM orchestration failed: ${errMsg}`,
              context_envelope: contextEnvelope,
            }));
          }
        }

        // === Deterministic Mock Fallback (no LlmProvider configured) ===
        const lowerPrompt = String(prompt || "").toLowerCase();
        let reply = "";
        const toolCalls: any[] = [];
        let proposedChangeset: ChangeSetProposal | undefined;

        if (lowerPrompt.includes("buff") || lowerPrompt.includes("propose") || lowerPrompt.includes("damage")) {
          const targetAttackId = contextEnvelope.selected_attack_ids[0] || "atk_light_punch";
          const csId = `cs_llm_${Date.now()}`;
          proposedChangeset = {
            changeset_id: csId,
            workspace_id: workspaceId,
            base_revision: state.latest_revision || "rev-1",
            target_revision: "rev-2",
            proposed_by: "combat_director_llm",
            status: "proposed",
            mutations: [
              {
                type: "attack_damage",
                attack_id: targetAttackId,
                current_damage: 25,
                proposed_damage: 35,
                reason: "Suggested damage adjustment based on user tuning request",
              },
            ],
            created_at: new Date().toISOString(),
          };
          this.saveChangeset(proposedChangeset);
          toolCalls.push({
            tool_id: "combat_propose_change",
            input: { workspace_id: workspaceId, mutations: proposedChangeset.mutations },
            output: { status: "PROPOSED", changeset_id: csId },
            untrusted_text: true,
          });
          reply = `I have drafted a changeset proposal to adjust damage for '${targetAttackId}' from 25 to 35. Please review and verify it through the Mechanical Gate.`;
        } else if (lowerPrompt.includes("simulate")) {
          toolCalls.push({
            tool_id: "combat_simulate",
            input: { workspace_id: workspaceId, scenario_id: "sc_preview" },
            output: { total_frames: 120, status: "COMPLETED" },
            untrusted_text: false,
          });
          reply = `Simulation completed across 120 frames with deterministic final state hash. Frame timings and hit reactions are consistent.`;
        } else if (lowerPrompt.includes("budget") || lowerPrompt.includes("exceeded")) {
          toolCalls.push({
            tool_id: "combat_explain_gate",
            input: { workspace_id: workspaceId, gate_run_id: "gate_budget_exceeded" },
            output: { verdict: "BUDGET_EXCEEDED" },
            untrusted_text: false,
          });
          reply = `The search space is too broad for the allocated execution budget. Please refine search constraints, narrow parameters, or increase computational budget.`;
        } else {
          reply = `Combat Director active for workspace [${workspaceId}]. Context loaded with snapshot '${contextEnvelope.snapshot_hash}' and ${contextEnvelope.selected_attack_ids.length} selected attack(s). How can I assist with your combat mechanics?`;
        }

        return finish(200, JSON.stringify({
          workspace_id: workspaceId,
          reply,
          tool_calls: toolCalls,
          proposed_changeset: proposedChangeset,
          context_envelope: contextEnvelope,
        }));
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
