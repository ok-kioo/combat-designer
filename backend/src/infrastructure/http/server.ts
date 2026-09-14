import { renameWorkspace } from '../../modules/workspace/application/rename-workspace.js';
import { createCharacter } from '../../modules/combat/service/create-character.js';
import {
  DEFAULT_DEV_EMAIL,
  DEFAULT_DEV_PASSWORD_HASH,
  DEFAULT_DEV_USER_ID,
  DEFAULT_DEV_USERNAME,
} from "../provider/auth/in-memory-auth-repository.js";
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
  CombatAnalysisPort,
} from "../../modules/combat/domain/repository/index.js";
import type { ProposalRepositoryPort } from "../../modules/proposal/domain/repository/index.js";
import type { Proposal } from "../../modules/proposal/domain/entity/index.js";
import type { LlmProvider } from "../../modules/llm/domain/port/llm-provider.js";
import { ChatOrchestrator } from "../../modules/llm/service/chat-orchestrator.js";
import type { ChatContextEnvelope } from "../../modules/llm/service/chat-orchestrator.js";
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
  SqliteChatRepository,
  type ChatRepositoryPort,
  type CharacterRepositoryPort,
  InMemoryCharacterRepository,
  type ComboRepositoryPort,
  InMemoryComboRepository,
  type AnalysisRepositoryPort,
  InMemoryAnalysisRepository,
  GetWorkspaceOverviewUseCase,
  SaveComboUseCase,
  RequestAnalysisUseCase,
  createPostgresDatabaseFromEnv,
  type PostgresDatabase,
  PostgresUserRepository,
  PostgresRefreshTokenRepository,
  PostgresWorkspaceRepository,
  PostgresChatRepository,
  PostgresCharacterRepository,
  PostgresComboRepository,
  PostgresAnalysisRepository,
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
    type: "simulation" | "analysis";
    id: string;
    status?: string;
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
  analysisPort?: CombatAnalysisPort;
  proposalRepo?: ProposalRepositoryPort;
  llmProvider?: LlmProvider;
  authService?: AuthService;
  workspaceRepo?: WorkspaceRepositoryPort;
  workspaceAuthorizationPort?: WorkspaceAuthorizationPort;
  chatRepo?: ChatRepositoryPort;
  characterRepo?: CharacterRepositoryPort;
  comboRepo?: ComboRepositoryPort;
  analysisRepo?: AnalysisRepositoryPort;
  postgresDatabase?: PostgresDatabase | null;
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
  public readonly analysisPort?: CombatAnalysisPort;
  public readonly proposalRepo?: ProposalRepositoryPort;
  public readonly chatOrchestrator?: ChatOrchestrator;
  public readonly authService: AuthService;
  public readonly authMiddleware: AuthMiddleware;
  public readonly authController: AuthController;
  public readonly workspaceRepo: WorkspaceRepositoryPort;
  public readonly workspaceAuthorizationPort: WorkspaceAuthorizationPort;
  public readonly chatRepo: ChatRepositoryPort;
  public readonly characterRepo: CharacterRepositoryPort;
  public readonly comboRepo: ComboRepositoryPort;
  public readonly analysisRepo: AnalysisRepositoryPort;
  public readonly postgresDatabase: PostgresDatabase | null;
  public readonly getOverviewUseCase: GetWorkspaceOverviewUseCase;
  public readonly saveComboUseCase: SaveComboUseCase;
  public readonly requestAnalysisUseCase: RequestAnalysisUseCase;
  public readonly allowLegacyHeader: boolean;
  private readonly workspaceStates = new Map<string, WorkspaceState>();
  private readonly proposalStore = new Map<string, Map<string, Proposal>>();

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
    this.analysisPort = config.analysisPort;
    this.proposalRepo = config.proposalRepo;
    this.allowLegacyHeader = config.allowLegacyHeader ?? true;
    this.postgresDatabase = config.postgresDatabase === undefined
      ? createPostgresDatabaseFromEnv()
      : config.postgresDatabase;

    this.workspaceRepo =
      config.workspaceRepo ??
      (this.postgresDatabase
        ? new PostgresWorkspaceRepository(this.postgresDatabase)
        : new InMemoryWorkspaceRepository());
    this.workspaceAuthorizationPort =
      config.workspaceAuthorizationPort ?? new WorkspaceAuthorizationService(this.workspaceRepo);

    this.chatRepo =
      config.chatRepo ??
      (this.postgresDatabase
        ? new PostgresChatRepository(this.postgresDatabase)
        : new SqliteChatRepository(process.env.CHAT_DB_PATH || ":memory:"));
    this.characterRepo =
      config.characterRepo ??
      (this.postgresDatabase
        ? new PostgresCharacterRepository(this.postgresDatabase)
        : new InMemoryCharacterRepository());
    this.comboRepo =
      config.comboRepo ??
      (this.postgresDatabase
        ? new PostgresComboRepository(this.postgresDatabase)
        : new InMemoryComboRepository());
    this.analysisRepo =
      config.analysisRepo ??
      (this.postgresDatabase
        ? new PostgresAnalysisRepository(this.postgresDatabase)
        : new InMemoryAnalysisRepository());

    this.getOverviewUseCase = new GetWorkspaceOverviewUseCase({
      workspaceRepo: this.workspaceRepo,
      characterRepo: this.characterRepo,
      comboRepo: this.comboRepo,
      analysisRepo: this.analysisRepo,
      getAttacks: async (wsId) => {
        const state = this.getWorkspaceState(wsId);
        return state.latest_envelope?.canonical_snapshot?.attacks ?? [];
      },
    });

    this.saveComboUseCase = new SaveComboUseCase(
      this.comboRepo,
      this.characterRepo,
      async (wsId) => {
        const state = this.getWorkspaceState(wsId);
        return state.latest_envelope?.canonical_snapshot?.attacks ?? [];
      }
    );

    this.requestAnalysisUseCase = new RequestAnalysisUseCase(
      this.analysisRepo,
      async (wsId) => {
        const state = this.getWorkspaceState(wsId);
        return state.latest_envelope?.canonical_snapshot?.attacks ?? [];
      },
      this.simulationPort
    );

    if (config.authService) {
      this.authService = config.authService;
    } else {
      const userRepo = this.postgresDatabase
        ? new PostgresUserRepository(this.postgresDatabase)
        : new InMemoryUserRepository();
      const tokenRepo = this.postgresDatabase
        ? new PostgresRefreshTokenRepository(this.postgresDatabase)
        : new InMemoryRefreshTokenRepository();
      this.authService = new AuthService(userRepo, tokenRepo, this.workspaceRepo);
    }
    this.authMiddleware = new AuthMiddleware(this.authService, this.workspaceAuthorizationPort);
    this.authController = new AuthController(this.authService, this.authMiddleware, this.workspaceRepo);

    // Initialize ChatOrchestrator if LLM provider is available
    if (config.llmProvider) {
      const fallbackQueryPort: CombatQueryPort = this.queryPort || {
        searchAttacks: async (params) => {
          const state = this.getWorkspaceState(params.workspace_id);
          const rawAttacks = state.latest_envelope?.canonical_snapshot?.attacks ?? [];
          return rawAttacks
            .filter((a) => {
              const attackName = typeof a.name === "string" ? a.name : a.name?.name ?? "";
              if (params.query && !attackName.toLowerCase().includes(params.query.toLowerCase())) return false;
              if (params.tag && (!a.tags || !a.tags.includes(params.tag))) return false;
              if (params.min_cancel_window !== undefined && a.cancels) {
                const hasWin = a.cancels.some((c) => (c.window.end - c.window.start) >= params.min_cancel_window!);
                if (!hasWin) return false;
              }
              return true;
            })
            .map((a) => ({
              attack_id: a.id,
              character_id: a.character_id ?? null,
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
        },
        getAttack: async (workspaceId, attackId) => {
          const state = this.getWorkspaceState(workspaceId);
          const rawAttacks = state.latest_envelope?.canonical_snapshot?.attacks ?? [];
          const a = rawAttacks.find((x) => x.id === attackId);
          if (!a) return null;
          return {
            attack_id: a.id,
              character_id: a.character_id ?? null,
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
          };
        },
        getImpactAnalysis: async (_workspaceId, attackId) => {
          return {
            attack_id: attackId,
            dependent_combos_count: 0,
            archetypes_affected: [],
            cancel_transitions_count: 0,
          };
        },
        getProvenance: async (_workspaceId, assetId) => {
          return {
            asset_id: assetId,
            source_file: "in-memory-snapshot",
            importer: "system",
            imported_at: new Date().toISOString(),
            untrusted_text: false,
          };
        },
        getScenarios: async (_workspaceId) => {
          return [];
        },
      };

      this.chatOrchestrator = new ChatOrchestrator(config.llmProvider, {
        queryPort: fallbackQueryPort,
        simulationPort: this.simulationPort,
        analysisPort: this.analysisPort,
        saveProposal: (proposal) => this.saveProposal(proposal),
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

  public recordAnalysisRun(workspaceId: string, id: string, status = "COMPLETED"): void {
    const state = this.getWorkspaceState(workspaceId);
    state.history.unshift({
      type: "analysis",
      id,
      status,
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

  private getProposalStore(workspaceId: string): Map<string, Proposal> {
    let store = this.proposalStore.get(workspaceId);
    if (!store) {
      store = new Map<string, Proposal>();
      this.proposalStore.set(workspaceId, store);
    }
    return store;
  }

  public saveProposal(proposal: Proposal): void {
    const store = this.getProposalStore(proposal.workspace_id);
    store.set(proposal.proposal_id, proposal);
    if (this.proposalRepo) {
      void this.proposalRepo.save(proposal);
    }
  }

  public getProposalById(workspaceId: string, proposalId: string): Proposal | null {
    const store = this.getProposalStore(workspaceId);
    return store.get(proposalId) ?? null;
  }

  public getProposalsForWorkspace(workspaceId: string): Proposal[] {
    const store = this.getProposalStore(workspaceId);
    return Array.from(store.values());
  }

  public async ensureSeedWorkspace(workspaceId: string): Promise<void> {
    const existing = await this.workspaceRepo.findById(workspaceId);
    if (existing) return;

    const now = new Date().toISOString();
    if (this.postgresDatabase) {
      await this.postgresDatabase.query(
        `INSERT INTO users (id, username, password_hash, display_name, email, status, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          DEFAULT_DEV_USER_ID,
          DEFAULT_DEV_USERNAME,
          DEFAULT_DEV_PASSWORD_HASH,
          "Developer",
          DEFAULT_DEV_EMAIL,
          now,
        ]
      );
    }

    await this.workspaceRepo.save({
      id: workspaceId,
      owner_user_id: DEFAULT_DEV_USER_ID,
      name: "Demo Workspace",
      description: "Seeded workspace for local exploration and smoke tests.",
      engine: "Unity",
      engine_version: "2022.3",
      status: "active",
      created_at: now,
      updated_at: now,
    });
  }

  public async seedDemoAttacks(workspaceId: string): Promise<void> {
    await this.ensureSeedWorkspace(workspaceId);
    const state = this.getWorkspaceState(workspaceId);
    const snapshotHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    state.has_snapshot = true;
    state.latest_revision = "rev-1.0.0";
    state.latest_snapshot_hash = snapshotHash;

    const sampleEnvelope: CanonicalSnapshotEnvelope = {
      workspace_id: workspaceId,
      project_id: "combat-core",
      revision: "rev-1.0.0",
      snapshot_id: "snap-01",
      snapshot_hash: snapshotHash,
      parser_version: "1.0",
      schema_version: "1.0",
      created_at: new Date().toISOString(),
      quarantined: [],
      conflicts: [],
      canonical_snapshot: {
        workspace_id: workspaceId,
        project_id: "combat-core",
        project_revision: "rev-1.0.0",
        snapshot_hash: snapshotHash,
        attacks: [
          {
            id: "atk_light_punch",
            name: { name: "Light Punch", raw_label: "Light Punch", untrusted_text: true },
            startup_frames: 4,
            active_frames: 3,
            recovery_frames: 8,
            damage: 25,
            hitstun_frames: 12,
            hitstop_frames: 4,
            blockstun_frames: 8,
            chip_damage: 0,
            guard_break_value: 0,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [
              {
                source_attack: "atk_light_punch",
                target_action: "atk_heavy_kick",
                window: { start: 7, end: 11 },
                condition: "on_hit",
              },
            ],
            tags: ["light", "punch", "normal", "combo_starter"],
            character_id: "char_default",
            assignment_status: "ASSIGNED",
            provenance: {
              status: "canonical",
              project_revision: "rev-1.0.0",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "punch_asset",
              source_path: "Assets/Punch.asset",
              confidence_permille: 1000,
            },
          },
          {
            id: "atk_heavy_kick",
            name: { name: "Heavy Kick", raw_label: "Heavy Kick", untrusted_text: true },
            startup_frames: 10,
            active_frames: 4,
            recovery_frames: 16,
            damage: 80,
            hitstun_frames: 22,
            hitstop_frames: 8,
            blockstun_frames: 14,
            chip_damage: 0,
            guard_break_value: 15,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [],
            tags: ["heavy", "kick", "normal", "knockdown"],
            character_id: "char_default",
            assignment_status: "ASSIGNED",
            provenance: {
              status: "canonical",
              project_revision: "rev-1.0.0",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "kick_asset",
              source_path: "Assets/Kick.asset",
              confidence_permille: 1000,
            },
          },
          {
            id: "atk_hadoken",
            name: { name: "Ki Fireball", raw_label: "Ki Fireball", untrusted_text: true },
            startup_frames: 13,
            active_frames: 6,
            recovery_frames: 18,
            damage: 60,
            hitstun_frames: 18,
            hitstop_frames: 6,
            blockstun_frames: 12,
            chip_damage: 10,
            guard_break_value: 0,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [{ resource_type: "meter", amount: 100, cost_frame: 1 }],
            hitboxes: [],
            cancels: [],
            tags: ["special", "projectile", "zoning"],
            character_id: "char_default",
            assignment_status: "ASSIGNED",
            provenance: {
              status: "canonical",
              project_revision: "rev-1.0.0",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "fireball_asset",
              source_path: "Assets/Fireball.asset",
              confidence_permille: 1000,
            },
          },
          {
            id: "atk_shoryuken",
            name: { name: "Dragon Uppercut", raw_label: "Dragon Uppercut", untrusted_text: true },
            startup_frames: 6,
            active_frames: 6,
            recovery_frames: 26,
            damage: 120,
            hitstun_frames: 35,
            hitstop_frames: 10,
            blockstun_frames: 18,
            chip_damage: 15,
            guard_break_value: 20,
            invuln_windows: [{ start: 1, end: 6 }],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [],
            tags: ["special", "anti-air", "reversal", "invulnerable"],
            character_id: "char_default",
            assignment_status: "ASSIGNED",
            provenance: {
              status: "canonical",
              project_revision: "rev-1.0.0",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "uppercut_asset",
              source_path: "Assets/Uppercut.asset",
              confidence_permille: 1000,
            },
          },
        ],
      },
    };

    state.latest_envelope = sampleEnvelope;

    const sampleProposal: Proposal = {
      proposal_id: `prop_demo_${workspaceId.replace(/[^a-zA-Z0-9]/g, "_")}`,
      workspace_id: workspaceId,
      base_revision: "rev-1.0.0",
      target_revision: "rev-1.0.1",
      proposed_by: "combat_director_llm",
      status: "ACTIVE",
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 32,
          reason: "Increase light punch reward on counter-hit",
        },
      ],
      created_at: new Date().toISOString(),
    };
    this.saveProposal(sampleProposal);
    await this.characterRepo.save({ id: "char_default", workspace_id: workspaceId, name: "Demo Fighter", display_name: "Demo Fighter", metadata: {}, provenance: { imported_at: new Date().toISOString(), importer: "demo" } });
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

    if (typeof res.setHeader === "function") {
      for (const [headerName, headerValue] of Object.entries(corsHeaders)) {
        res.setHeader(headerName, headerValue);
      }
    }

    if (typeof res.writeHead === "function") {
      const origWriteHead = res.writeHead.bind(res);
      res.writeHead = (statusCode: number, ...args: any[]): any => {
        if (args.length > 0 && typeof args[0] === "object" && args[0] !== null) {
          args[0] = { ...corsHeaders, ...args[0] };
        } else if (args.length > 1 && typeof args[1] === "object" && args[1] !== null) {
          args[1] = { ...corsHeaders, ...args[1] };
        } else {
          args.push(corsHeaders);
        }
        return (origWriteHead as any)(statusCode, ...args);
      };
    }

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
      // Backend is API-only. Product UI is served by the React frontend.
      if (method === "GET" && (pathname === "/" || pathname === "/app")) {
        return finish(200, JSON.stringify({
          service: "combat-designer-api",
          ui: "frontend-react",
          message: "Use the React frontend for product navigation.",
        }));
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

            // Optional demo data seeding when requested (e.g. initial project for web workbench)
            if (body.seed_demo_data === true || body.seed_demo === true) {
              await this.seedDemoAttacks(workspaceId);
            }

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

      if (method === "PATCH" && singleWorkspaceMatch) {
        const auth = await this.authMiddleware.authenticate(req);
        if (!auth.authenticated) return finish(auth.status, JSON.stringify({ error: auth.code }));
        try {
          const body = JSON.parse(await this.readRequestBody(req));
          const result = await renameWorkspace(this.workspaceRepo, auth.context.userId, decodeURIComponent(singleWorkspaceMatch[1]), body.name);
          return finish(result.status, JSON.stringify('workspace' in result ? result.workspace : { error: result.error }));
        } catch { return finish(400, JSON.stringify({ error: "BAD_REQUEST" })); }
      }

      if (method === "DELETE" && singleWorkspaceMatch) {
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

        if (this.workspaceRepo.delete) {
          await this.workspaceRepo.delete(workspaceId);
        }
        this.workspaceStates.delete(workspaceId);
        return finish(204, "");
      }

      // 4e. Archive Workspace: PUT /api/workspaces/:workspace_id/archive (Spec 14)
      const archiveWorkspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/archive\/?$/);
      if (method === "PUT" && archiveWorkspaceMatch) {
        const workspaceId = decodeURIComponent(archiveWorkspaceMatch[1]);
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

        workspace.status = "archived";
        workspace.updated_at = new Date().toISOString();
        await this.workspaceRepo.save(workspace);
        return finish(200, JSON.stringify(workspace));
      }

      // 4f. Workspace Overview & Real KPIs: GET /api/workspaces/:workspace_id/overview (Spec 14)
      const overviewMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/overview\/?$/);
      if (method === "GET" && overviewMatch) {
        const workspaceId = decodeURIComponent(overviewMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        try {
          const result = await this.getOverviewUseCase.execute({ workspace_id: workspaceId });
          return finish(200, JSON.stringify(result));
        } catch (err: any) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: err.message }));
        }
      }

      // 4g. Characters list & details (Spec 14)
      const charactersMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/characters\/?$/);
      if (method === "GET" && charactersMatch) {
        const workspaceId = decodeURIComponent(charactersMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const characters = await this.characterRepo.findByWorkspace(workspaceId);
        return finish(200, JSON.stringify({ workspace_id: workspaceId, count: characters.length, characters }));
      }

      if (method === "POST" && charactersMatch) {
        const workspaceId = decodeURIComponent(charactersMatch[1]);
        const auth = await this.authMiddleware.authenticate(req);
        if (!auth.authenticated) return finish(auth.status, JSON.stringify({ error: auth.code }));
        const workspace = await this.workspaceRepo.findById(workspaceId);
        if (!workspace || workspace.owner_user_id !== auth.context.userId) return finish(404, JSON.stringify({ error: "WORKSPACE_UNAVAILABLE" }));
        if (workspace.status === "archived") return finish(409, JSON.stringify({ error: "WORKSPACE_ARCHIVED" }));
        try {
          const body = JSON.parse(await this.readRequestBody(req));
          const character = await createCharacter(this.characterRepo, workspaceId, body, `char-${crypto.randomUUID()}`, new Date().toISOString());
          return finish(201, JSON.stringify(character));
        } catch { return finish(400, JSON.stringify({ error: "INVALID_CHARACTER" })); }
      }

      const singleCharMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/characters\/([^/]+)\/?$/);
      if (method === "GET" && singleCharMatch) {
        const workspaceId = decodeURIComponent(singleCharMatch[1]);
        const characterId = decodeURIComponent(singleCharMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const character = await this.characterRepo.findById(workspaceId, characterId);
        if (!character) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Character '${characterId}' not found in workspace` }));
        }
        return finish(200, JSON.stringify(character));
      }

      // 4h. Combos list & create (Spec 14)
      const combosMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/combos\/?$/);
      if (combosMatch) {
        const workspaceId = decodeURIComponent(combosMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        if (method === "GET") {
          const searchParams = new URL(url, "http://localhost").searchParams;
          const charId = searchParams.get("character_id") || undefined;
          const source = searchParams.get("source") || undefined;
          const combos = await this.comboRepo.findByWorkspace(workspaceId, { character_id: charId, source });
          return finish(200, JSON.stringify({ workspace_id: workspaceId, count: combos.length, combos }));
        }

        if (method === "POST") {
          try {
            const bodyStr = await this.readRequestBody(req);
            const body = JSON.parse(bodyStr || "{}");
            const result = await this.saveComboUseCase.execute({
              workspace_id: workspaceId,
              character_id: body.character_id,
              name: body.name,
              source: body.source,
              steps: body.steps,
              notes: body.notes,
              evidence: body.evidence,
            });

            if (!result.success) {
              return finish(400, JSON.stringify({ error: result.error, message: result.message }));
            }
            return finish(201, JSON.stringify(result.combo));
          } catch (err: any) {
            return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: err.message }));
          }
        }
      }

      const singleComboMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/combos\/([^/]+)\/?$/);
      if (singleComboMatch) {
        const workspaceId = decodeURIComponent(singleComboMatch[1]);
        const comboId = decodeURIComponent(singleComboMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        if (method === "GET") {
          const combo = await this.comboRepo.findById(workspaceId, comboId);
          if (!combo) {
            return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Combo '${comboId}' not found` }));
          }
          const evaluation = await this.comboRepo.getEvaluation(comboId);
          return finish(200, JSON.stringify({ combo, evaluation }));
        }

        if (method === "DELETE") {
          const deleted = await this.comboRepo.delete(workspaceId, comboId);
          if (!deleted) {
            return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Combo '${comboId}' not found` }));
          }
          return finish(204, "");
        }
      }

      // 4i. Conversations list & create (Spec 14)
      const conversationsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/?$/);
      if (conversationsMatch) {
        const workspaceId = decodeURIComponent(conversationsMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const userId = (auth as any).userId || (req.headers["x-user-id"] as string) || "anonymous";

        if (method === "GET") {
          const conversations = await this.chatRepo.findConversations(userId, workspaceId);
          return finish(200, JSON.stringify({ workspace_id: workspaceId, count: conversations.length, conversations }));
        }

        if (method === "POST") {
          try {
            const bodyStr = await this.readRequestBody(req);
            const body = JSON.parse(bodyStr || "{}");
            const cid = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const now = new Date().toISOString();
            const conv = await this.chatRepo.createConversation({
              id: cid,
              user_id: userId,
              workspace_id: workspaceId,
              title: body.title || "Nova Conversa",
              created_at: now,
              updated_at: now,
            });
            return finish(201, JSON.stringify(conv));
          } catch (err: any) {
            return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: err.message }));
          }
        }
      }

      // 4j. Conversation Messages list (Spec 14)
      const messagesMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)\/messages\/?$/);
      if (method === "GET" && messagesMatch) {
        const workspaceId = decodeURIComponent(messagesMatch[1]);
        const conversationId = decodeURIComponent(messagesMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const userId = (auth as any).userId || (req.headers["x-user-id"] as string) || "anonymous";
        const conv = await this.chatRepo.getConversation(conversationId, userId, workspaceId);
        if (!conv) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Conversation '${conversationId}' not found or access denied` }));
        }

        const messages = await this.chatRepo.getMessages(conversationId, userId, workspaceId);
        return finish(200, JSON.stringify({ conversation_id: conversationId, count: messages.length, messages }));
      }

      // 4k. Analyses list & request (Spec 14)
      const analysesMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/analyses\/?$/);
      if (analysesMatch) {
        const workspaceId = decodeURIComponent(analysesMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }

        if (method === "GET") {
          const searchParams = new URL(url, "http://localhost").searchParams;
          const charId = searchParams.get("character_id") || undefined;
          const analyses = await this.analysisRepo.findByWorkspace(workspaceId, { character_id: charId });
          return finish(200, JSON.stringify({ workspace_id: workspaceId, count: analyses.length, analyses }));
        }

        if (method === "POST") {
          try {
            const bodyStr = await this.readRequestBody(req);
            const body = JSON.parse(bodyStr || "{}");
            const analysis = await this.requestAnalysisUseCase.execute({
              workspace_id: workspaceId,
              character_id: body.character_id,
              subject: body.subject,
              target_attack_id: body.target_attack_id,
              sequence: body.sequence,
            });
            this.recordAnalysisRun(workspaceId, analysis.id, "COMPLETED");
            return finish(201, JSON.stringify(analysis));
          } catch (err: any) {
            return finish(400, JSON.stringify({ error: "BAD_REQUEST", message: err.message }));
          }
        }
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
              character_id: a.character_id ?? null,
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


      // 11. List Proposals: GET /api/workspaces/:workspace_id/proposals
      const proposalsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/proposals\/?$/);
      if (method === "GET" && proposalsMatch) {
        const workspaceId = decodeURIComponent(proposalsMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const list = this.getProposalsForWorkspace(workspaceId);
        return finish(200, JSON.stringify({ workspace_id: workspaceId, count: list.length, proposals: list }));
      }

      // 12. Create Proposal: POST /api/workspaces/:workspace_id/proposals
      const createProposalMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/proposals\/?$/);
      if (method === "POST" && createProposalMatch) {
        const workspaceId = decodeURIComponent(createProposalMatch[1]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const payload = JSON.parse(bodyText || "{}");
        const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const proposal: Proposal = {
          proposal_id: id,
          workspace_id: workspaceId,
          base_revision: payload.base_revision || "rev-1",
          target_revision: payload.target_revision || "rev-2",
          proposed_by: payload.proposed_by || "human_designer",
          status: "ACTIVE",
          mutations: payload.mutations || [],
          created_at: new Date().toISOString(),
          idempotency_key: payload.idempotency_key,
        };
        this.saveProposal(proposal);
        return finish(201, JSON.stringify({ status: "ACTIVE", workspace_id: workspaceId, proposal }));
      }

      // 13. Get Proposal by ID: GET /api/workspaces/:workspace_id/proposals/:proposal_id
      const singleProposalMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/proposals\/([^/]+)\/?$/);
      if (method === "GET" && singleProposalMatch) {
        const workspaceId = decodeURIComponent(singleProposalMatch[1]);
        const proposalId = decodeURIComponent(singleProposalMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const found = this.getProposalById(workspaceId, proposalId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Proposal '${proposalId}' not found` }));
        }
        return finish(200, JSON.stringify({ workspace_id: workspaceId, proposal: found }));
      }

      // 16. Withdraw Proposal: POST /api/workspaces/:workspace_id/proposals/:proposal_id/withdraw
      const withdrawMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/proposals\/([^/]+)\/withdraw\/?$/);
      if (method === "POST" && withdrawMatch) {
        const workspaceId = decodeURIComponent(withdrawMatch[1]);
        const proposalId = decodeURIComponent(withdrawMatch[2]);
        const auth = await this.checkAuthorization(req, workspaceId);
        if (!auth.authorized) {
          return finish(auth.status, JSON.stringify({ error: auth.code, message: auth.message }));
        }
        const bodyText = await this.readRequestBody(req);
        const { reason } = JSON.parse(bodyText || "{}");
        const found = this.getProposalById(workspaceId, proposalId);
        if (!found) {
          return finish(404, JSON.stringify({ error: "NOT_FOUND", message: `Proposal '${proposalId}' not found` }));
        }
        found.status = "WITHDRAWN";
        this.saveProposal(found);
        return finish(200, JSON.stringify({ status: "WITHDRAWN", workspace_id: workspaceId, proposal: found, reason }));
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

        const userId = (auth as any).userId || (req.headers["x-user-id"] as string) || "user_default";
        let convId = (context?.conversation_id as string) || undefined;
        if (this.chatRepo) {
          try {
            const now = new Date().toISOString();
            if (convId) {
              const existing = await this.chatRepo.getConversation(convId, userId, workspaceId);
              if (!existing) {
                const conv = await this.chatRepo.createConversation({
                  id: convId,
                  workspace_id: workspaceId,
                  user_id: userId,
                  title: "Combat Discussion",
                  created_at: now,
                  updated_at: now,
                });
                convId = conv.id;
              }
            } else {
              const conversations = await this.chatRepo.findConversations(userId, workspaceId);
              if (conversations.length > 0) {
                convId = conversations[0].id;
              } else {
                const conv = await this.chatRepo.createConversation({
                  id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  workspace_id: workspaceId,
                  user_id: userId,
                  title: "General Discussion",
                  created_at: now,
                  updated_at: now,
                });
                convId = conv.id;
              }
            }
            if (prompt && convId) {
              await this.chatRepo.saveMessage({
                id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                conversation_id: convId,
                workspace_id: workspaceId,
                role: "user",
                content: prompt,
                content_format: "markdown",
                status: "completed",
                created_at: new Date().toISOString(),
              });
            }
          } catch (repoErr) {
            console.warn("Could not persist user message:", repoErr);
          }
        }

        const contextEnvelope: ChatContextEnvelope = {
          workspace_id: workspaceId,
          user_id: userId,
          conversation_id: convId || `conv_${workspaceId}_default`,
          snapshot_hash: context?.snapshot_hash ?? state.latest_snapshot_hash ?? "snapshot_default",
          selected_attack_ids: (context?.selected_attack_ids as string[]) ?? [],
          active_proposal_id: context?.active_proposal_id as string | undefined,
          user_prompt: prompt,
          timestamp: new Date().toISOString(),
          history: context?.history,
        };

        // === LLM Orchestrator Path (when LlmProvider is configured) ===
        if (this.chatOrchestrator) {
          try {
            const result = await this.chatOrchestrator.processMessage(contextEnvelope);
            if (this.chatRepo && convId && result.reply) {
              await this.chatRepo.saveMessage({
                id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                conversation_id: convId,
                workspace_id: workspaceId,
                role: "assistant",
                content: result.reply,
                content_format: "markdown",
                status: "completed",
                created_at: new Date().toISOString(),
              });
            }
            return finish(200, JSON.stringify({
              message_id: result.message_id,
              conversation_id: result.conversation_id,
              workspace_id: workspaceId,
              processing_state: result.processing_state,
              intent: result.intent,
              reply: result.reply,
              activities: result.activities,
              tool_calls: result.tool_calls,
              proposed_proposal: result.proposed_proposal,
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
        let proposedProposal: Proposal | undefined;

        if (lowerPrompt.includes("buff") || lowerPrompt.includes("propose") || lowerPrompt.includes("damage")) {
          const targetAttackId = contextEnvelope.selected_attack_ids[0] || "atk_light_punch";
          const proposalId = `prop_llm_${Date.now()}`;
          proposedProposal = {
            proposal_id: proposalId,
            workspace_id: workspaceId,
            base_revision: state.latest_revision || "rev-1",
            target_revision: "rev-2",
            proposed_by: "combat_director_llm",
            status: "ACTIVE",
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
          this.saveProposal(proposedProposal);
          toolCalls.push({
            tool_id: "combat_create_proposal",
            input: { workspace_id: workspaceId, mutations: proposedProposal.mutations },
            output: { status: "ACTIVE", proposal_id: proposalId },
            untrusted_text: true,
          });
          reply = `I have drafted a suggested adjustment proposal to adjust damage for '${targetAttackId}' from 25 to 35. Please review the proposal and examine the diagnostic findings.`;
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
            tool_id: "combat_analyze",
            input: { workspace_id: workspaceId, subject: "budget_exceeded" },
            output: { status: "BUDGET_EXCEEDED" },
            untrusted_text: false,
          });
          reply = `The search space is too broad for the allocated execution budget. Please refine search constraints, narrow parameters, or increase computational budget.`;
        } else {
          reply = `Combat Director active for workspace [${workspaceId}]. Context loaded with snapshot '${contextEnvelope.snapshot_hash}' and ${contextEnvelope.selected_attack_ids.length} selected attack(s). How can I assist with your combat mechanics?`;
        }

        if (this.chatRepo && convId && reply) {
          try {
            await this.chatRepo.saveMessage({
              id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              conversation_id: convId,
              workspace_id: workspaceId,
              role: "assistant",
              content: reply,
              content_format: "markdown",
              status: "completed",
              created_at: new Date().toISOString(),
            });
          } catch (repoErr) {
            console.warn("Could not persist assistant reply:", repoErr);
          }
        }

        return finish(200, JSON.stringify({
          conversation_id: convId,
          workspace_id: workspaceId,
          reply,
          tool_calls: toolCalls,
          proposal: proposedProposal,
          proposed_proposal: proposedProposal,
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
