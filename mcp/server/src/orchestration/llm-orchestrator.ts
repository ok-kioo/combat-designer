import {
  CombatIntentSchema,
  type CombatIntent,
  type Principal,
  type GateResult,
  McpError,
} from "@combat-designer/shared-contracts";
import type { McpGatewayRouter } from "../../../gateway/src/routing/router.js";
import type { ApplicationAdapter } from "../adapters/application-adapter.js";

export class LlmOrchestrator {
  constructor(
    private gateway: McpGatewayRouter,
    private adapter: ApplicationAdapter
  ) {}

  parseIntent(rawIntent: unknown): CombatIntent {
    const parsed = CombatIntentSchema.safeParse(rawIntent);
    if (!parsed.success) {
      throw new McpError(
        "INVALID_REQUEST",
        `Failed to parse structured combat intent: ${parsed.error.message}`
      );
    }
    return parsed.data;
  }

  async executeIntent(principal: Principal, intent: CombatIntent): Promise<unknown> {
    // Check for hallucinated workspace
    if (!principal.authorized_workspaces.includes(intent.workspace_id)) {
      throw new McpError(
        "UNAUTHORIZED",
        `Hallucinated or unauthorized workspace '${intent.workspace_id}' rejected.`
      );
    }

    switch (intent.type) {
      case "search": {
        return await this.gateway.execute(principal, "combat_search", {
          workspace_id: intent.workspace_id,
          query: intent.query,
          tag: intent.tag,
          min_cancel_window: intent.min_cancel_window,
        });
      }

      case "simulate": {
        return await this.gateway.execute(principal, "combat_simulate", {
          workspace_id: intent.workspace_id,
          project_id: intent.project_id,
          scenario: {
            scenario_id: intent.scenario_id,
            actors: [{ actor_id: "hero", team: 1, initial_health: 100, attack_ids: ["atk_1"] }],
          },
          config: {
            budget: {
              max_frames: intent.max_frames,
              max_events: 1000,
              max_transitions: 1000,
            },
          },
        });
      }

      case "verify": {
        return await this.gateway.execute(principal, "combat_verify", {
          workspace_id: intent.workspace_id,
          project_id: intent.project_id,
          project_revision: intent.project_revision,
          canonical_snapshot_hash: intent.canonical_snapshot_hash,
          simulation_input_hash: intent.simulation_input_hash,
          simulation_input: { scenario: { scenario_id: "test" }, config: { budget: { max_frames: 60 } } },
          verification_profile: intent.profile,
          verification_budget: {
            max_events: 1000,
            max_states: 1000,
            max_cycles: 50,
            max_steps: 2000,
          },
          rule_set_version: "1.0.0",
          verifier_version: "1.0.0",
        });
      }

      case "propose": {
        // Validate that target attacks exist to prevent hallucinated attack IDs
        for (const mut of intent.mutations) {
          const attack = await this.adapter.getAttack(intent.workspace_id, mut.attack_id);
          if (!attack) {
            throw new McpError(
              "RESOURCE_NOT_FOUND",
              `Hallucinated attack ID '${mut.attack_id}' does not exist in workspace '${intent.workspace_id}'.`
            );
          }
        }

        return await this.gateway.execute(principal, "combat_propose_change", {
          workspace_id: intent.workspace_id,
          base_revision: intent.base_revision,
          target_revision: intent.target_revision,
          mutations: intent.mutations,
          idempotency_key: intent.idempotency_key,
        });
      }

      case "approve": {
        // Reject fabricated approval by non-human
        if (principal.principal_type !== "human") {
          throw new McpError(
            "HUMAN_APPROVAL_REQUIRED",
            "Fabricated approval rejected: LLM cannot approve changesets. Human approval is strictly required."
          );
        }
        throw new McpError(
          "INVALID_REQUEST",
          "Approval must be performed through verified gate workflow."
        );
      }

      default:
        throw new McpError("INVALID_REQUEST", `Unknown intent type.`);
    }
  }

  preserveMechanicalVerdict(gateResult: GateResult): string {
    // Mechanical Gate is the sole authority
    switch (gateResult.verdict) {
      case "PASS":
        return "PASS";
      case "FAIL":
        return "FAIL";
      case "BLOCKED":
        return "BLOCKED";
      case "STALE":
        return "STALE";
      case "BUDGET_EXCEEDED":
        return "BUDGET_EXCEEDED";
      case "ERROR":
        return "ERROR";
      default:
        return "UNKNOWN";
    }
  }

  validateLlmClaim(claimedVerdict: string, authoritativeGateResult: GateResult): void {
    if (claimedVerdict === "PASS" && authoritativeGateResult.verdict !== "PASS") {
      throw new McpError(
        "MECHANICAL_GATE_FAILED",
        `Fabricated verdict rejected: LLM claimed PASS, but authoritative Mechanical Gate verdict is '${authoritativeGateResult.verdict}'.`
      );
    }
  }
}
