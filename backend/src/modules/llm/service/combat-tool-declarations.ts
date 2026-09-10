/**
 * Combat Tool Declarations — Maps existing MCP tool handlers to
 * LlmToolDeclaration format for Gemini function calling.
 *
 * Each declaration mirrors the schema used by the MCP tool handlers
 * in mcp/server/src/tools/handlers.ts, scoped to a workspace_id.
 */

import type { LlmToolDeclaration } from "../domain/port/llm-provider.js";

export function getCombatToolDeclarations(workspaceId: string): LlmToolDeclaration[] {
  return [
    {
      name: "combat_search",
      description: `Search for attacks in workspace '${workspaceId}'. Returns matching attacks with frame data, damage, tags, and cancel windows. Use this to find attacks by keyword, tag, or minimum cancel window.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query to match attack names or descriptions.",
          },
          tag: {
            type: "string",
            description: "Filter attacks by tag (e.g., 'melee', 'projectile', 'anti-air').",
          },
          min_cancel_window: {
            type: "number",
            description: "Minimum cancel window in frames. Only return attacks with cancel windows at least this wide.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return. Default: 20.",
          },
        },
        required: [],
      },
    },
    {
      name: "combat_simulate",
      description: `Execute a deterministic combat simulation in workspace '${workspaceId}'. Requires a scenario with actors, their attacks, and a frame budget. Returns simulation output with frame-by-frame results.`,
      parameters: {
        type: "object",
        properties: {
          scenario_id: {
            type: "string",
            description: "Identifier for the simulation scenario.",
          },
          max_frames: {
            type: "number",
            description: "Maximum number of frames to simulate. Default: 300.",
          },
        },
        required: ["scenario_id"],
      },
    },
    {
      name: "combat_verify",
      description: `Run Mechanical Gate verification in workspace '${workspaceId}'. Checks balance constraints (DPS limits, burst damage, juggle frames, reaction windows). Returns an authoritative verdict: PASS, FAIL, BLOCKED, STALE, BUDGET_EXCEEDED, or ERROR. You must NEVER fabricate or override this verdict.`,
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "The project identifier.",
          },
          project_revision: {
            type: "string",
            description: "The project revision to verify.",
          },
          canonical_snapshot_hash: {
            type: "string",
            description: "Hash of the canonical snapshot to verify against.",
          },
          verification_profile: {
            type: "string",
            description: "Verification profile: 'strict', 'relaxed', or 'custom'.",
            enum: ["strict", "relaxed", "custom"],
          },
        },
        required: ["project_id"],
      },
    },
    {
      name: "combat_propose_change",
      description: `Propose a ChangeSet with mutations to attack parameters in workspace '${workspaceId}'. Creates a proposal that must be reviewed, verified through the Mechanical Gate, and approved by a human before it can be applied. You may ONLY propose — you cannot approve or apply.`,
      parameters: {
        type: "object",
        properties: {
          base_revision: {
            type: "string",
            description: "The current project revision the change is based on.",
          },
          target_revision: {
            type: "string",
            description: "The target revision identifier for the proposed change.",
          },
          mutations: {
            type: "array",
            description: "Array of mutation objects. Each has 'type' (attack_damage, attack_recovery, cancel_window, resource_cost, hitbox), 'attack_id', and type-specific fields.",
            items: { type: "object" },
          },
        },
        required: ["base_revision", "target_revision", "mutations"],
      },
    },
    {
      name: "combat_explain_gate",
      description: `Explain a Mechanical Gate verdict for workspace '${workspaceId}'. Provides human-readable explanation of why a gate run produced its verdict (PASS, FAIL, BUDGET_EXCEEDED, etc.).`,
      parameters: {
        type: "object",
        properties: {
          gate_run_id: {
            type: "string",
            description: "The ID of the gate run to explain.",
          },
          verdict: {
            type: "string",
            description: "The verdict to explain (optional, used for context).",
          },
        },
        required: ["gate_run_id"],
      },
    },
    {
      name: "combat_impact_analysis",
      description: `Analyze the impact of modifying a specific attack in workspace '${workspaceId}'. Returns which scenarios, combos, and balance properties would be affected.`,
      parameters: {
        type: "object",
        properties: {
          attack_id: {
            type: "string",
            description: "The attack ID to analyze impact for.",
          },
        },
        required: ["attack_id"],
      },
    },
    {
      name: "list_scenarios",
      description: `List all available combat scenarios in workspace '${workspaceId}'. Returns scenario IDs, names, actor configurations, and descriptions.`,
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];
}
