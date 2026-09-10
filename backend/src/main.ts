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
      console.log("🤖 Gemini LLM Provider: ENABLED (model: gemini-3.7-flash)");
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
  const state = server.getWorkspaceState(workspaceId);
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

  // Pre-seed a demo changeset proposal
  const sampleChangeset: ChangeSetProposal = {
    changeset_id: "cs_demo_buff_punch",
    workspace_id: workspaceId,
    base_revision: "rev-1.0.0",
    target_revision: "rev-1.0.1",
    proposed_by: "combat_director_llm",
    status: "proposed",
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
  server.saveChangeset(sampleChangeset);
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
