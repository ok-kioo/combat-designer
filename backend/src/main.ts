/**
 * Combat Designer — Application Server Entrypoint
 *
 * Runs the backend HTTP API Server with:
 * - Pre-seeded demo workspace (`ws-default`) with fighting game attacks
 * - GeminiProvider LLM orchestrator (when GEMINI_API_KEY is present)
 * - Interactive browser workbench UI at http://localhost:3001
 * - Full REST API routes for catalog, simulations, gate verifications, changesets, and chat
 */

import { ApiServer } from "./infrastructure/http/server.js";
import { GeminiProvider } from "./infrastructure/provider/llm/gemini-provider.js";
import type { LlmProvider } from "./modules/llm/domain/port/llm-provider.js";
import type { CanonicalSnapshotEnvelope } from "./modules/ingestion/domain/entity/snapshot.js";
import type { ChangeSetProposal } from "./modules/changeset/domain/entity/index.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_WORKSPACE = process.env.DEFAULT_WORKSPACE || "ws-default";

async function main() {
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
  seedDefaultWorkspace(server, DEFAULT_WORKSPACE);

  await server.listen();

  console.log("\n🚀 Server is running and listening!");
  console.log(`\n👉 Open in Browser:     http://localhost:${PORT}/`);
  console.log(`👉 REST API Base:       http://localhost:${PORT}/api/workspaces/${DEFAULT_WORKSPACE}`);
  console.log(`👉 Health Check:        http://localhost:${PORT}/health`);
  console.log(`👉 Metrics:             http://localhost:${PORT}/metrics`);
  console.log("\nAvailable Features in Browser Workbench:");
  console.log("  1. 📋 Attack Catalog with frame data & LLM selection checkboxes");
  console.log("  2. 🎮 Deterministic Simulator & Mechanical Gate Safety Checks");
  console.log("  3. 📝 ChangeSet Review (Approve, Apply, Withdraw mutations)");
  console.log("  4. 💬 Combat Director Chat (Gemini LLM / Function Calling)");
  console.log("==================================================\n");
}

function seedDefaultWorkspace(server: ApiServer, workspaceId: string) {
  server.seedDemoAttacks(workspaceId);
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
