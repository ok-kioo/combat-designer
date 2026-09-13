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
      name: "combat_analyze",
      description: `Execute combat analysis and diagnostics in workspace '${workspaceId}'. Evaluates simulation outcomes, frame timings, damage scaling, stun loops, and counterplay windows to produce consultative findings and recommendations.`,
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Subject or focus of the analysis.",
          },
          target_attack_id: {
            type: "string",
            description: "Optional specific attack ID to analyze.",
          },
          sequence: {
            type: "array",
            description: "Optional sequence of attack IDs to analyze for loops or combos.",
            items: { type: "string" },
          },
        },
        required: ["subject"],
      },
    },
    {
      name: "combat_propose_change",
      description: `Propose a ChangeSet with mutations to attack parameters in workspace '${workspaceId}'. Creates a proposal that can be reviewed and validated. You may ONLY propose — you cannot alter the engine.`,
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
