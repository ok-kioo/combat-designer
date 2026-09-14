// Combat Domain
export * from "./modules/combat/domain/entity/index.js";
export * from "./modules/combat/domain/repository/index.js";
export * from "./modules/combat/service/index.js";

// Proposal Domain
export * from "./modules/proposal/domain/entity/index.js";
export * from "./modules/proposal/domain/repository/index.js";
export * from "./modules/proposal/service/index.js";

// FIC Governance
export * from "./modules/fic/domain/entity/index.js";

// MCP Domain
export * from "./modules/mcp/domain/entity/index.js";

// Ingestion Domain
export * from "./modules/ingestion/domain/entity/index.js";

// Observability Domain
export * from "./modules/observability/domain/entity/index.js";
export * from "./modules/observability/domain/repository/index.js";

// Workspace Domain
export * from "./modules/workspace/index.js";

// Auth Domain (Spec 12)
export {
  UserSchema,
  type User,
  UserPublicSchema,
  type UserPublic,
  RefreshTokenSchema,
  type RefreshToken,
  type AccessTokenClaims,
  type AuthTokens,
  type UserRepositoryPort,
  type RefreshTokenRepositoryPort,
  hashPassword,
  verifyPassword,
  TokenService,
  DEFAULT_JWT_SECRET,
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
  AuthService,
  AuthRateLimiter,
  type RegisterInput,
  type LoginInput,
  AuthController,
} from "./modules/auth/index.js";
export * from "./infrastructure/provider/workspace/in-memory-workspace-repository.js";

// Infrastructure Middleware
export * from "./infrastructure/middleware/index.js";

// Infrastructure Providers
export * from "./infrastructure/provider/ingestion/index.js";
export {
  type GraphDriver,
  type GraphRecord,
  type GraphQueryResult,
  type GraphSession,
  Neo4jGraphDriver,
  InMemoryGraphDriver,
  initializeGraphSchema,
  projectCanonicalSnapshot,
  checkProjectionStatus,
  queryCancelOptions,
  queryPathsToLauncher,
  queryCandidateCycles,
  queryImpactAnalysis,
  queryProvenance,
  queryScenarios,
  type CancelOptionItem,
  type LauncherPathItem,
  type CycleCandidateItem,
  type ProvenanceResult,
  type ScenarioItem,
  type GraphAdapter,
  type ProjectorOptions,
  type ProjectionSummary,
  type ProjectionStatusResult,
  DefaultGraphAdapter,
} from "./infrastructure/provider/knowledge-graph/index.js";
export * from "./infrastructure/provider/observability/index.js";
export * from "./infrastructure/provider/auth/in-memory-auth-repository.js";
export * from "./infrastructure/provider/chat/sqlite-chat-repository.js";
export * from "./infrastructure/provider/postgres/index.js";
export type { ChatRepositoryPort } from "./modules/llm/domain/repository/chat-repository-port.js";

// Infrastructure HTTP
export * from "./infrastructure/http/server.js";
