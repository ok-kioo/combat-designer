import type { AuthorizedToolCallContext } from "../../../gateway/src/routing/router.js";
import type { ApplicationAdapter } from "../adapters/application-adapter.js";
import { McpError } from "@combat-designer/backend";

export function createToolHandlers(adapter: ApplicationAdapter) {
  return {
    combat_search: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as {
        workspace_id: string;
        query?: string;
        tag?: string;
        min_cancel_window?: number;
        limit?: number;
      };
      const attacks = await adapter.searchCombat(
        ctx.workspace_id,
        p.query,
        p.tag,
        p.min_cancel_window,
        p.limit
      );
      return {
        classification: "FACT",
        workspace_id: ctx.workspace_id,
        count: attacks.length,
        attacks: attacks.map((atk) => ({
          ...atk,
          untrusted_text: true, // Asset names/comments treated as data
        })),
      };
    },

    combat_get_attack: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as { workspace_id: string; attack_id: string };
      const attack = await adapter.getAttack(ctx.workspace_id, p.attack_id);
      if (!attack) {
        throw new McpError("RESOURCE_NOT_FOUND", `Attack '${p.attack_id}' not found in workspace '${ctx.workspace_id}'.`);
      }
      return {
        classification: "FACT",
        workspace_id: ctx.workspace_id,
        attack: {
          ...attack,
          untrusted_text: true,
        },
      };
    },

    list_scenarios: async (ctx: AuthorizedToolCallContext) => {
      const scenarios = await adapter.listScenarios(ctx.workspace_id);
      return {
        classification: "FACT",
        workspace_id: ctx.workspace_id,
        scenarios: scenarios.map((sc) => ({
          ...sc,
          untrusted_text: true,
        })),
      };
    },

    impact_analysis: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as { workspace_id: string; attack_id: string };
      const impact = await adapter.getImpactAnalysis(ctx.workspace_id, p.attack_id);
      return {
        classification: "FACT",
        workspace_id: ctx.workspace_id,
        impact,
      };
    },

    combat_simulate: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as any;
      const simulationInput = {
        workspace_id: ctx.workspace_id,
        project_id: p.project_id,
        model_revision: "current",
        scenario: p.scenario,
        inputs: [],
        config: p.config,
      };
      const result = await adapter.simulate(simulationInput);
      return {
        classification: "SIMULATION_RESULT",
        workspace_id: ctx.workspace_id,
        simulation: result,
      };
    },

    combat_analyze: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as any;
      const request = {
        workspace_id: ctx.workspace_id,
        project_id: p.project_id || "default",
        project_revision: p.project_revision || "rev-1",
        canonical_snapshot_hash: p.canonical_snapshot_hash || "latest",
        simulation_input_hash: p.simulation_input_hash || "auto",
        simulation_input: (p.simulation_input && p.simulation_input.scenario) ? p.simulation_input : {
          workspace_id: ctx.workspace_id,
          project_id: p.project_id || "default",
          model_revision: p.project_revision || "rev-1",
          scenario: { scenario_id: "auto", actors: [{ actor_id: "hero", team: 1, initial_health: 100, attack_ids: ["atk_1"] }] },
          inputs: [],
          config: {
            budget: { max_frames: 60, max_events: 1000, max_transitions: 1000 },
          },
        },
        verification_profile: {
          kind: p.verification_profile || "strict",
          max_sustained_dps: 150,
          max_burst_damage: 250,
          dps_window_frames: 60,
          max_juggle_frames: 90,
          min_reaction_window_frames: 4,
          min_counterplay_window_frames: 6,
          require_provenance: true,
          require_guard_integrity: true,
          require_cycle_analysis: true,
        },
        verification_budget: {
          max_events_to_analyze: p.verification_budget?.max_events ?? 10000,
          max_states_explored: p.verification_budget?.max_states ?? 10000,
          max_cycles_checked: p.verification_budget?.max_cycles ?? 1000,
          max_verification_steps: p.verification_budget?.max_steps ?? 20000,
          max_evidence_items: 500,
        },
        rule_set_version: p.rule_set_version || "1.0.0",
        verifier_version: p.verifier_version || "1.0.0",
      };

      const analysisResult = await adapter.analyze(request as any);
      return {
        classification: "SIMULATION_RESULT",
        source: "combat_analysis",
        workspace_id: ctx.workspace_id,
        analysis_id: analysisResult.analysis_id,
        status: analysisResult.status,
        findings: analysisResult.findings,
        recommendations: analysisResult.recommendations,
        analysis_result: analysisResult,
      };
    },

    combat_create_proposal: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as any;
      const proposal = await adapter.createProposal(
        ctx.workspace_id,
        p.base_revision,
        p.target_revision,
        ctx.principal.principal_id,
        p.mutations,
        p.idempotency_key
      );
      return {
        classification: "SUGGESTION",
        workspace_id: ctx.workspace_id,
        proposal,
      };
    },

    combat_get_proposal: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as { workspace_id: string; proposal_id: string };
      const proposal = await adapter.getProposal(ctx.workspace_id, p.proposal_id);
      if (!proposal) {
        throw new McpError("RESOURCE_NOT_FOUND", `Proposal '${p.proposal_id}' not found in workspace '${ctx.workspace_id}'.`);
      }
      return {
        classification: "FACT",
        workspace_id: ctx.workspace_id,
        proposal,
      };
    },

    combat_withdraw_proposal: async (ctx: AuthorizedToolCallContext) => {
      const p = ctx.validated_params as { workspace_id: string; proposal_id: string; reason: string };
      const withdrawn = await adapter.withdrawProposal(ctx.workspace_id, p.proposal_id, p.reason);
      return {
        classification: "SUGGESTION",
        workspace_id: ctx.workspace_id,
        proposal: withdrawn,
      };
    },
  };
}
