/**
 * Combat Designer — Application Server Entrypoint
 *
 * Runs the backend HTTP API Server with:
 * - Pre-seeded demo attacks for local exploration
 * - GeminiProvider LLM orchestrator (when GEMINI_API_KEY is present)
 * - REST API routes for auth, workspaces, catalog, simulations, analysis, proposals, and chat
 */

import { ApiServer } from "./infrastructure/http/server.js";
import { GeminiProvider } from "./infrastructure/provider/llm/gemini-provider.js";
import type { LlmProvider } from "./modules/llm/domain/port/llm-provider.js";
import type { CanonicalSnapshotEnvelope } from "./modules/ingestion/domain/entity/snapshot.js";
import type { Proposal } from "./modules/proposal/domain/entity/index.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_WORKSPACE = process.env.DEFAULT_WORKSPACE || "ws-default";

async function main() {
  validateRuntimeSecrets();

  console.log("==================================================");
  console.log("⚔️  COMBAT DESIGNER — Starting Application Server");
  console.log("==================================================");

  // Setup LLM Provider if API key is provided
  let llmProvider: LlmProvider | undefined;
  if (process.env.GEMINI_API_KEY) {
    try {
      llmProvider = new GeminiProvider(process.env.GEMINI_API_KEY);
      console.log(`🤖 Gemini LLM Provider: ENABLED (model: ${process.env.GEMINI_MODEL || "gemini-3.6-flash"})`);
    } catch (err: any) {
      console.warn("⚠️  Failed to initialize GeminiProvider:", err.message);
      console.log("ℹ️  Falling back to Deterministic Mock LLM.");
    }
  } else {
    console.log("ℹ️  GEMINI_API_KEY not found in environment.");
    console.log("ℹ️  Running with Deterministic Mock LLM (backward-compatible mode).");
    console.log("💡 Tip: export GEMINI_API_KEY='your-key' to enable real Gemini function calling.");
  }

  const server = new ApiServer({
    port: PORT,
    llmProvider,
  });

  // Seed default workspace with fighting game attacks for instant exploration
  await seedDefaultWorkspace(server, DEFAULT_WORKSPACE);

  await server.listen();

  console.log("\n🚀 Server is running and listening!");
  console.log(`\n👉 Open in Browser:     http://localhost:${PORT}/`);
  console.log(`👉 REST API Base:       http://localhost:${PORT}/api/workspaces/${DEFAULT_WORKSPACE}`);
  console.log(`👉 Health Check:        http://localhost:${PORT}/health`);
  console.log(`👉 Metrics:             http://localhost:${PORT}/metrics`);
  console.log("\nAvailable API capabilities:");
  console.log("  1. Attack catalog and deterministic simulations");
  console.log("  2. Combat analysis with findings and recommendations");
  console.log("  3. Consultative proposals without engine mutation");
  console.log("  4. Combat Director Chat (Gemini LLM / Function Calling)");
  console.log("==================================================\n");
}

function validateRuntimeSecrets(): void {
  const missing = ["JWT_SECRET"].filter((name) => !process.env[name] || process.env[name]?.trim() === "");
  if (process.env.NODE_ENV === "production" && (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "")) {
    missing.push("DATABASE_URL");
  }
  if (process.env.NEO4J_URI) {
    if (!process.env.NEO4J_USER || process.env.NEO4J_USER.trim() === "") missing.push("NEO4J_USER");
    if (!process.env.NEO4J_PASSWORD || process.env.NEO4J_PASSWORD.trim() === "") missing.push("NEO4J_PASSWORD");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required runtime secret(s): ${missing.join(", ")}`);
  }
}

async function seedDefaultWorkspace(server: ApiServer, workspaceId: string): Promise<void> {
  await server.seedDemoAttacks(workspaceId);
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
