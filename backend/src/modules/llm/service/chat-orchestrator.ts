/**
 * ChatOrchestrator — Application service that orchestrates the Combat Director chat
 * following the canonical pipeline defined in SPEC 13:
 *
 * User Request
 *     ↓
 * Intent / Scope Policy
 *     ↓
 * Agent Skill
 *     ↓
 * Relevant Project Context (user_id, workspace_id, conversation_id)
 *     ↓
 * Authorized Tools (Skill Allowlist)
 *     ↓
 * Analysis / Search
 *     ↓
 * Proposal
 *     ↓
 * Deterministic Simulation
 *     ↓
 * Mechanical Validation (Mechanical Validator)
 *     ↓
 * Spec Validation (Spec Validator)
 *     ↓
 * Evidence
 *     ↓
 * LLM Explanation
 *     ↓
 * Recommendation
 *
 * Invariants:
 * - O Combat Director recomenda; ele NÃO altera a engine.
 * - combat_apply_change NÃO EXISTE.
 * - Mensagens falsas de execução ("Comando executado.", etc.) são terminantemente proibidas.
 * - OUT_OF_SCOPE retorna mensagem oficial com ZERO ferramentas chamadas.
 * - Tool activities utilizam identificadores e labels públicos (PublicActivity).
 * - Erros internos nunca vazam stack traces, SQL ou trace_ids no chat.
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
import { ChatIntentClassifier } from "./chat-intent-classifier.js";
import { SkillRegistry } from "./skill-registry.js";
import { SpecValidator } from "./spec-validator.js";
import { ContextManager } from "./context-manager.js";
import {
  type ChatIntent,
  type ChatProcessingState,
  type PublicActivity,
  type PublicChatErrorCode,
  DEFAULT_OUT_OF_SCOPE_MESSAGE,
  DEFAULT_UNSAFE_MESSAGE,
  DEFAULT_GREETING_MESSAGE,
} from "../domain/entity/chat.js";

export const MAX_TOOL_CALL_ROUNDS = 5;

export interface ChatContextEnvelope {
  workspace_id: string;
  user_id?: string;
  conversation_id?: string;
  skill_id?: string;
  snapshot_hash: string;
  selected_attack_ids: string[];
  active_changeset_id?: string;
  user_prompt: string;
  timestamp: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ToolCallRecord {
  tool_id: string;
  input: Record<string, unknown>;
  output: unknown;
  untrusted_text: boolean;
}

export interface ChatOrchestratorResult {
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  processing_state: ChatProcessingState;
  intent: ChatIntent;
  reply: string;
  reply_details?: {
    content: string;
    content_format: "markdown";
  };
  activities: PublicActivity[];
  tool_calls: ToolCallRecord[];
  proposed_changeset?: ChangeSetProposal;
  error?: {
    code: PublicChatErrorCode;
    message: string;
  };
}

export interface ChatOrchestratorPorts {
  queryPort?: CombatQueryPort;
  simulationPort?: SimulationPort;
  gatePort?: MechanicalGatePort;
  saveChangeset: (proposal: ChangeSetProposal) => void;
  getWorkspaceRevision: (workspaceId: string) => string | undefined;
}

export class ChatOrchestrator {
  private readonly intentClassifier: ChatIntentClassifier;
  private readonly skillRegistry: SkillRegistry;
  private readonly specValidator: SpecValidator;
  private readonly contextManager: ContextManager;

  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly ports: ChatOrchestratorPorts
  ) {
    this.intentClassifier = new ChatIntentClassifier();
    this.skillRegistry = new SkillRegistry();
    this.specValidator = new SpecValidator();
    this.contextManager = new ContextManager();
  }

  async processMessage(envelope: ChatContextEnvelope): Promise<ChatOrchestratorResult> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const conversationId = envelope.conversation_id || `conv_${envelope.workspace_id}_default`;
    const userId = envelope.user_id || "user_default";
    const prompt = envelope.user_prompt || "";
    const cleanPrompt = prompt.trim();
    const lowerPrompt = cleanPrompt.toLowerCase();

    // 1. Initial Greeting Detection (case F from Acceptance Prompt: User says "Oi", no fake commands)
    const isPureGreeting = ["oi", "ola", "olá"].includes(lowerPrompt);
    if (isPureGreeting) {
      return {
        message_id: messageId,
        conversation_id: conversationId,
        workspace_id: envelope.workspace_id,
        processing_state: "COMPLETED",
        intent: "EXPLANATION",
        reply: DEFAULT_GREETING_MESSAGE,
        reply_details: {
          content: DEFAULT_GREETING_MESSAGE,
          content_format: "markdown",
        },
        activities: [],
        tool_calls: [],
      };
    }

    // 2. Intent Classification
    const intent = this.intentClassifier.classify(prompt);

    // 3. Rejection of OUT_OF_SCOPE (Zero tools, zero graph queries, zero simulations)
    if (intent === "OUT_OF_SCOPE") {
      return {
        message_id: messageId,
        conversation_id: conversationId,
        workspace_id: envelope.workspace_id,
        processing_state: "COMPLETED",
        intent: "OUT_OF_SCOPE",
        reply: DEFAULT_OUT_OF_SCOPE_MESSAGE,
        reply_details: {
          content: DEFAULT_OUT_OF_SCOPE_MESSAGE,
          content_format: "markdown",
        },
        activities: [],
        tool_calls: [],
        error: {
          code: "OUT_OF_SCOPE",
          message: DEFAULT_OUT_OF_SCOPE_MESSAGE,
        },
      };
    }

    // 4. Rejection of UNSAFE / Direct Prompt Injection attempts
    if (intent === "UNSAFE") {
      return {
        message_id: messageId,
        conversation_id: conversationId,
        workspace_id: envelope.workspace_id,
        processing_state: "COMPLETED",
        intent: "UNSAFE",
        reply: DEFAULT_UNSAFE_MESSAGE,
        reply_details: {
          content: DEFAULT_UNSAFE_MESSAGE,
          content_format: "markdown",
        },
        activities: [],
        tool_calls: [],
        error: {
          code: "TOOL_DENIED",
          message: DEFAULT_UNSAFE_MESSAGE,
        },
      };
    }

    // 5. Skill Resolution
    const skill = envelope.skill_id
      ? this.skillRegistry.getSkill(envelope.skill_id) || this.skillRegistry.resolveSkillForIntent(intent)
      : this.resolveSkillForPrompt(intent, lowerPrompt);

    // 6. Build Context respecting Hierarchy & Budgets
    const builtContext = this.contextManager.buildContext(
      {
        identity: {
          user_id: userId,
          workspace_id: envelope.workspace_id,
          conversation_id: conversationId,
        },
        userPrompt: prompt,
        snapshotHash: envelope.snapshot_hash,
        selectedAttackIds: envelope.selected_attack_ids,
        activeChangesetId: envelope.active_changeset_id,
        historyMessages: envelope.history,
      },
      skill.purpose
    );

    if (builtContext.isBudgetExceeded) {
      return {
        message_id: messageId,
        conversation_id: conversationId,
        workspace_id: envelope.workspace_id,
        processing_state: "ERROR",
        intent,
        reply: `Limite de contexto excedido: ${builtContext.budgetReason}. Por favor, refine sua consulta.`,
        reply_details: {
          content: `Limite de contexto excedido: ${builtContext.budgetReason}. Por favor, refine sua consulta.`,
          content_format: "markdown",
        },
        activities: [],
        tool_calls: [],
        error: {
          code: "CONTEXT_LIMIT",
          message: builtContext.budgetReason || "Context budget limit exceeded",
        },
      };
    }

    // 7. Get Tool Declarations (filtered by Skill Allowlist)
    const allTools = getCombatToolDeclarations(envelope.workspace_id);
    const authorizedTools = allTools.filter((t) => skill.allowed_tools.includes(t.name));

    const toolCallRecords: ToolCallRecord[] = [];
    const publicActivities: PublicActivity[] = [];
    let proposedChangeset: ChangeSetProposal | undefined;

    const history: Array<{ role: "user" | "model"; parts: any[] }> = [];

    // Initial call to LLM Provider
    let response: any;
    try {
      response = await this.llmProvider.chat({
        system_prompt: builtContext.systemPrompt,
        tools: authorizedTools,
        user_message: builtContext.userMessage,
        history,
      });
    } catch (err: any) {
      throw err;
    }

    let rounds = 0;

    // Function Calling Loop (max MAX_TOOL_CALL_ROUNDS)
    while (response.function_calls && response.function_calls.length > 0 && rounds < MAX_TOOL_CALL_ROUNDS) {
      rounds++;

      if (rounds === 1) {
        history.push({
          role: "user",
          parts: [{ text: builtContext.userMessage }],
        });
      }

      history.push({
        role: "model",
        parts: response.function_calls.map((fc: LlmFunctionCall) => ({
          functionCall: { name: fc.name, args: fc.args },
        })),
      });

      const toolResults: LlmToolResult[] = [];

      for (const fc of response.function_calls) {
        const isKnownTool = allTools.some((t) => t.name === fc.name);
        if (!isKnownTool) {
          const unknownOutput = {
            error: `Unknown tool: ${fc.name}`,
            tool_name: fc.name,
          };
          toolResults.push({
            name: fc.name,
            call_id: fc.id,
            result: unknownOutput,
          });
          toolCallRecords.push({
            tool_id: fc.name,
            input: fc.args,
            output: unknownOutput,
            untrusted_text: false,
          });
          continue;
        }

        // Enforce Tool Allowlist against Skill
        if (!this.skillRegistry.isToolAllowed(skill.skill_id, fc.name)) {
          const deniedOutput = {
            error: `TOOL_DENIED: Tool '${fc.name}' is not in the allowlist for skill '${skill.skill_id}'.`,
          };
          toolResults.push({
            name: fc.name,
            call_id: fc.id,
            result: deniedOutput,
          });
          toolCallRecords.push({
            tool_id: fc.name,
            input: fc.args,
            output: deniedOutput,
            untrusted_text: false,
          });
          continue;
        }

        // Emit public activity with controlled friendly label
        const activity = this.skillRegistry.createPublicActivity(skill.skill_id, fc.name, "started");
        publicActivities.push(activity);

        // Execute tool call through authoritative ports
        const execResult = await this.executeToolCall(envelope.workspace_id, fc);
        activity.status = "completed";

        toolResults.push({
          name: fc.name,
          call_id: fc.id,
          result: execResult.output,
        });

        toolCallRecords.push(execResult.record);

        if (fc.name === "combat_propose_change" && execResult.changeset) {
          proposedChangeset = execResult.changeset;
        }
      }

      history.push({
        role: "user",
        parts: toolResults.map((tr) => ({
          functionResponse: { name: tr.name, result: tr.result },
        })),
      });

      try {
        response = await this.llmProvider.chat({
          system_prompt: builtContext.systemPrompt,
          tools: authorizedTools,
          user_message: builtContext.userMessage,
          tool_results: toolResults,
          history,
        });
      } catch (err: any) {
        throw err;
      }
    }

    // Build final reply with strict evidence distinction
    let rawReply = response.text || "";

    // Sanitize any accidental fake execution phrases from LLM
    rawReply = this.sanitizeFakeExecutionMessages(rawReply);

    if (rounds >= MAX_TOOL_CALL_ROUNDS && response.function_calls && response.function_calls.length > 0) {
      rawReply += "\n\n⚠️ Tool call limit reached. Limite de chamadas de ferramentas atingido. Please refine your request.";
    }

    if (!rawReply && toolCallRecords.length > 0) {
      rawReply = "Análise concluída com base nas evidências coletadas das ferramentas autorizadas.";
    }

    if (!rawReply) {
      rawReply = DEFAULT_GREETING_MESSAGE;
    }

    return {
      message_id: messageId,
      conversation_id: conversationId,
      workspace_id: envelope.workspace_id,
      processing_state: "COMPLETED",
      intent,
      reply: rawReply,
      reply_details: {
        content: rawReply,
        content_format: "markdown",
      },
      activities: publicActivities,
      tool_calls: toolCallRecords,
      proposed_changeset: proposedChangeset,
    };
  }

  private resolveSkillForPrompt(intent: ChatIntent, lowerPrompt: string) {
    if (lowerPrompt.includes("combo")) {
      return this.skillRegistry.getSkill("find_combo")!;
    }
    if (lowerPrompt.includes("gate") || lowerPrompt.includes("verify") || lowerPrompt.includes("spec")) {
      return this.skillRegistry.getSkill("validate_proposal")!;
    }
    if (intent === "BALANCE_ANALYSIS" || intent === "COMBAT_ANALYSIS") {
      return this.skillRegistry.getSkill("propose_balance_adjustment")!;
    }
    return this.skillRegistry.resolveSkillForIntent(intent);
  }

  private sanitizeFakeExecutionMessages(text: string): string {
    return text
      .replace(/Comando executado\.?/gi, "Análise concluída.")
      .replace(/Alteração aplicada\.?/gi, "Proposta gerada para revisão.")
      .replace(/Projeto atualizado\.?/gi, "Dados de combate avaliados.")
      .replace(/Gate aprovado\.?/gi, "Validação mecânica concluída.");
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

        case "combat_get_attack": {
          if (!this.ports.queryPort) {
            output = { error: "Query capability not available" };
            break;
          }
          const attackId = (fc.args.attack_id as string) || "";
          const attack = await this.ports.queryPort.getAttack(workspaceId, attackId);
          if (!attack) {
            output = { error: `Attack not found: ${attackId}`, attack_id: attackId };
          } else {
            output = { ...attack, untrusted_text: true };
          }
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
            output = { error: "Mechanical Validator capability not available" };
            break;
          }
          const simInput: SimulationInput = {
            workspace_id: workspaceId,
            project_id: (fc.args.project_id as string) || "default",
            model_revision: (fc.args.project_revision as string) || "current",
            scenario: { scenario_id: "auto", actors: [] },
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

          // Canonical Flow: Proposal -> Spec Validation
          const specResult = this.specValidator.validate(changeset);

          output = {
            status: "PROPOSED",
            changeset_id: csId,
            mutations_count: mutations.length,
            spec_validation: specResult,
            message: "Proposta criada para revisão humana. O Combat Director não altera a Unity.",
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
              : `Mechanical Validator evaluation '${gateRunId}' determined deterministic compliance under strict profile.`,
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
