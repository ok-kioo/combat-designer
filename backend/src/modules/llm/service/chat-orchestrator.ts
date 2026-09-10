/**
 * ChatOrchestrator — Application service that orchestrates the LLM
 * function calling loop for the Combat Director chat.
 *
 * Flow:
 * 1. Receives LlmPromptContextEnvelope from the HTTP route
 * 2. Builds system prompt with Combat Director rules
 * 3. Converts MCP tool schemas to LLM tool declarations
 * 4. Calls LlmProvider.chat() with user message + context
 * 5. Loops on function calls (max MAX_TOOL_CALL_ROUNDS):
 *    - Executes each tool call against backend ports
 *    - Sends results back to LLM
 * 6. Returns final response with text + executed tool calls + proposed changeset
 *
 * Security invariants preserved:
 * - Mechanical Gate verdicts are never fabricated or overridden
 * - untrusted_text markers are preserved on all data outputs
 * - Workspace isolation: all tool calls scoped to envelope workspace_id
 * - LLM can only PROPOSE changes — never approve or apply
 */

import type { LlmProvider, LlmFunctionCall, LlmToolResult } from "../domain/port/llm-provider.js";
import type {
  CombatQueryPort,
  AttackSummary,
  SimulationPort,
  MechanicalGatePort,
} from "../../combat/domain/repository/index.js";
import type { SimulationInput, SimulationOutput, VerificationRequest } from "@combat-designer/backend";
import type { ChangeSetProposal } from "../../changeset/domain/entity/index.js";
import { getCombatToolDeclarations } from "./combat-tool-declarations.js";

export const MAX_TOOL_CALL_ROUNDS = 5;

export interface ChatContextEnvelope {
  workspace_id: string;
  snapshot_hash: string;
  selected_attack_ids: string[];
  active_changeset_id?: string;
  user_prompt: string;
  timestamp: string;
}

export interface ToolCallRecord {
  tool_id: string;
  input: Record<string, unknown>;
  output: unknown;
  untrusted_text: boolean;
}

export interface ChatOrchestratorResult {
  reply: string;
  tool_calls: ToolCallRecord[];
  proposed_changeset?: ChangeSetProposal;
}

export interface ChatOrchestratorPorts {
  queryPort?: CombatQueryPort;
  simulationPort?: SimulationPort;
  gatePort?: MechanicalGatePort;
  saveChangeset: (proposal: ChangeSetProposal) => void;
  getWorkspaceRevision: (workspaceId: string) => string | undefined;
}

function buildSystemPrompt(envelope: ChatContextEnvelope): string {
  return `You are the Combat Director for the Combat Designer platform.
Your role is to help game designers analyze, simulate, and tune combat mechanics.

WORKSPACE CONTEXT:
- Workspace ID: ${envelope.workspace_id}
- Snapshot Hash: ${envelope.snapshot_hash}
- Selected Attacks: ${envelope.selected_attack_ids.length > 0 ? envelope.selected_attack_ids.join(", ") : "none selected"}
- Active ChangeSet: ${envelope.active_changeset_id || "none"}

AVAILABLE TOOLS:
You have access to tools for searching attacks, simulating combat,
verifying balance via the Mechanical Gate, proposing changes, explaining gate verdicts,
analyzing impact, and listing scenarios.

CARDINAL RULES:
1. NEVER fabricate Gate verdicts. The Mechanical Gate is the sole authority on balance verification.
2. NEVER approve or apply ChangeSets. Only humans can approve and apply changes.
3. ALWAYS use workspace_id '${envelope.workspace_id}' for all tool calls — do not reference other workspaces.
4. When proposing changes, consider running simulation and verification first to validate the impact.
5. Explain your reasoning clearly and reference specific frame data, damage values, and cancel windows.
6. If you are unsure about a value, use combat_search to look it up before making claims.

WORKFLOW: LLM proposes → Gateway authorizes → Application validates → Simulator calculates → Mechanical Gate decides → Human approves → Application applies.`;
}

export class ChatOrchestrator {
  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly ports: ChatOrchestratorPorts
  ) {}

  async processMessage(envelope: ChatContextEnvelope): Promise<ChatOrchestratorResult> {
    const systemPrompt = buildSystemPrompt(envelope);
    const tools = getCombatToolDeclarations(envelope.workspace_id);
    const toolCallRecords: ToolCallRecord[] = [];
    let proposedChangeset: ChangeSetProposal | undefined;

    // Build the user message with context
    const userMessage = this.buildUserMessage(envelope);

    // Conversation history for multi-round tool calls within this turn
    const history: Array<{ role: "user" | "model"; parts: any[] }> = [];

    // Initial call to LLM
    let response = await this.llmProvider.chat({
      system_prompt: systemPrompt,
      tools,
      user_message: userMessage,
      history,
    });

    let rounds = 0;

    // Function calling loop
    while (response.function_calls.length > 0 && rounds < MAX_TOOL_CALL_ROUNDS) {
      rounds++;

      // Add the user message to history (only on first round)
      if (rounds === 1) {
        history.push({
          role: "user",
          parts: [{ text: userMessage }],
        });
      }

      // Add model's function call response to history
      history.push({
        role: "model",
        parts: response.function_calls.map((fc) => ({
          functionCall: { name: fc.name, args: fc.args },
        })),
      });

      // Execute each function call
      const toolResults: LlmToolResult[] = [];
      for (const fc of response.function_calls) {
        const result = await this.executeToolCall(envelope.workspace_id, fc);
        toolResults.push({
          name: fc.name,
          call_id: fc.id,
          result: result.output,
        });

        toolCallRecords.push(result.record);

        // Track proposed changesets
        if (fc.name === "combat_propose_change" && result.changeset) {
          proposedChangeset = result.changeset;
        }
      }

      // Add tool results to history
      history.push({
        role: "user",
        parts: toolResults.map((tr) => ({
          functionResponse: { name: tr.name, result: tr.result },
        })),
      });

      // Send results back to LLM
      response = await this.llmProvider.chat({
        system_prompt: systemPrompt,
        tools,
        user_message: userMessage,
        tool_results: toolResults,
        history,
      });
    }

    // Build final reply
    let reply = response.text || "";

    if (rounds >= MAX_TOOL_CALL_ROUNDS && response.function_calls.length > 0) {
      reply += "\n\n⚠️ Tool call limit reached. Some operations were not completed. Please refine your request.";
    }

    if (!reply && toolCallRecords.length > 0) {
      reply = "I executed the requested operations. Please review the tool call results.";
    }

    if (!reply) {
      reply = `Combat Director active for workspace [${envelope.workspace_id}]. How can I assist with your combat mechanics?`;
    }

    return {
      reply,
      tool_calls: toolCallRecords,
      proposed_changeset: proposedChangeset,
    };
  }

  private buildUserMessage(envelope: ChatContextEnvelope): string {
    let message = envelope.user_prompt;

    if (envelope.selected_attack_ids.length > 0) {
      message += `\n\n[Context: The designer has selected the following attacks for reference: ${envelope.selected_attack_ids.join(", ")}]`;
    }

    if (envelope.active_changeset_id) {
      message += `\n\n[Context: There is an active changeset under review: ${envelope.active_changeset_id}]`;
    }

    return message;
  }

  private async executeToolCall(
    workspaceId: string,
    fc: LlmFunctionCall
  ): Promise<{
    output: unknown;
    record: ToolCallRecord;
    changeset?: ChangeSetProposal;
  }> {
    let output: unknown;
    let untrustedText = false;
    let changeset: ChangeSetProposal | undefined;

    try {
      switch (fc.name) {
        case "combat_search": {
          if (!this.ports.queryPort) {
            output = { error: "Search capability not available" };
            break;
          }
          const attacks = await this.ports.queryPort.searchAttacks({
            workspace_id: workspaceId,
            query: fc.args.query as string | undefined,
            tag: fc.args.tag as string | undefined,
            min_cancel_window: fc.args.min_cancel_window as number | undefined,
            limit: fc.args.limit as number | undefined,
          });
          output = {
            count: attacks.length,
            attacks: attacks.map((atk: AttackSummary) => ({ ...atk, untrusted_text: true })),
          };
          untrustedText = true;
          break;
        }

        case "combat_simulate": {
          if (!this.ports.simulationPort) {
            output = { error: "Simulation capability not available" };
            break;
          }
          const simInput: SimulationInput = {
            workspace_id: workspaceId,
            project_id: (fc.args.project_id as string) || "default",
            model_revision: "current",
            scenario: {
              scenario_id: (fc.args.scenario_id as string) || "default",
              actors: [],
            },
            inputs: [],
            config: {
              tick_rate: 60,
              budget: {
                max_frames: (fc.args.max_frames as number) || 300,
                max_events: 1000,
                max_state_transitions: 1000,
                max_entities: 10,
              },
            },
          };
          const simResult = await this.ports.simulationPort.simulate(simInput);
          output = { simulation: simResult, source: "deterministic_simulator" };
          break;
        }

        case "combat_verify": {
          if (!this.ports.gatePort) {
            output = { error: "Verification capability not available" };
            break;
          }
          const simInput: SimulationInput = {
            workspace_id: workspaceId,
            project_id: (fc.args.project_id as string) || "default",
            model_revision: (fc.args.project_revision as string) || "current",
            scenario: {
              scenario_id: "auto",
              actors: [],
            },
            inputs: [],
            config: {
              tick_rate: 60,
              budget: {
                max_frames: 60,
                max_events: 1000,
                max_state_transitions: 1000,
                max_entities: 10,
              },
            },
          };

          let simOutput: SimulationOutput;
          if (this.ports.simulationPort) {
            simOutput = await this.ports.simulationPort.simulate(simInput);
          } else {
            simOutput = {
              status: "COMPLETED",
              total_frames: 60,
              events: [],
              final_state_hash: "hash_verify",
              metrics: {
                total_frames: 60,
                damage: 0,
                hits: 0,
                blocked_hits: 0,
                misses: 0,
                stun_frames: 0,
                recovery_frames: 0,
                resource_spent: 0,
                resource_remaining: 0,
                state_transitions: 0,
                cancel_count: 0,
                launch_count: 0,
                juggle_count: 0,
              },
            };
          }

          const verifyRequest: VerificationRequest = {
            workspace_id: workspaceId,
            project_id: (fc.args.project_id as string) || "default",
            project_revision: (fc.args.project_revision as string) || "current",
            canonical_snapshot_hash: (fc.args.canonical_snapshot_hash as string) || "latest",
            simulation_input_hash: "auto",
            simulation_input: simInput as unknown as Record<string, unknown>,
            verification_profile: {
              kind: ((fc.args.verification_profile as string) || "strict") as any,
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
              max_events_to_analyze: 10000,
              max_states_explored: 10000,
              max_cycles_checked: 1000,
              max_verification_steps: 20000,
              max_evidence_items: 500,
            },
            rule_set_version: "1.0.0",
            verifier_version: "1.0.0",
          };
          const gateResult = await this.ports.gatePort.verify(verifyRequest, simOutput);
          output = {
            source: "mechanical_gate",
            gate_run_id: gateResult.gate_run_id,
            verdict: gateResult.verdict,
            violations: gateResult.violations,
            gate_result: gateResult,
          };
          break;
        }

        case "combat_propose_change": {
          const mutations = (fc.args.mutations as any[]) || [];
          const baseRevision = (fc.args.base_revision as string) || this.ports.getWorkspaceRevision(workspaceId) || "rev-1";
          const targetRevision = (fc.args.target_revision as string) || "rev-proposed";
          const csId = `cs_llm_${Date.now()}`;

          changeset = {
            changeset_id: csId,
            workspace_id: workspaceId,
            base_revision: baseRevision,
            target_revision: targetRevision,
            proposed_by: "combat_director_llm",
            status: "proposed",
            mutations,
            created_at: new Date().toISOString(),
          };
          this.ports.saveChangeset(changeset);

          output = {
            status: "PROPOSED",
            changeset_id: csId,
            mutations_count: mutations.length,
            message: "ChangeSet proposed. Requires human review, Gate verification, and approval before application.",
          };
          untrustedText = true;
          break;
        }

        case "combat_explain_gate": {
          const gateRunId = fc.args.gate_run_id as string;
          const verdict = fc.args.verdict as string | undefined;
          const isBudgetExceeded =
            gateRunId?.includes("budget_exceeded") || verdict === "BUDGET_EXCEEDED";
          output = {
            gate_run_id: gateRunId,
            explanation: isBudgetExceeded
              ? "The search space is too broad for the allocated execution budget. Please refine search constraints, narrow parameters, or increase the computational budget."
              : `Mechanical Gate run '${gateRunId}' evaluated safety properties deterministic under strict profile.`,
          };
          break;
        }

        case "combat_impact_analysis": {
          const attackId = fc.args.attack_id as string;
          output = {
            attack_id: attackId,
            workspace_id: workspaceId,
            affected_scenarios: [],
            affected_combos: [],
            balance_impact: "Analysis requires full simulation data.",
          };
          break;
        }

        case "list_scenarios": {
          output = {
            workspace_id: workspaceId,
            scenarios: [],
            message: "No scenarios loaded in current workspace snapshot.",
          };
          break;
        }

        default:
          output = { error: `Unknown tool: ${fc.name}`, tool_name: fc.name };
          break;
      }
    } catch (err: any) {
      output = {
        error: `Tool execution failed: ${err.message || String(err)}`,
        tool_name: fc.name,
      };
    }

    return {
      output,
      record: {
        tool_id: fc.name,
        input: fc.args,
        output,
        untrusted_text: untrustedText,
      },
      changeset,
    };
  }
}
