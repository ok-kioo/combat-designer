import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import { MarkdownRenderer } from "../services/markdown-renderer.js";
import type {
  DirectorChatState,
  ChatMessage,
  ToolCallPreview,
  PublicActivity,
  LlmPromptContextEnvelope,
  DirectorChatResponse,
  ChatProcessingState,
} from "../types/index.js";

export interface DirectorChatProps {
  workspaceId: string;
  conversationId?: string;
  apiClient?: ApiClient;
  initialMessages?: ChatMessage[];
  currentSnapshotHash?: string;
  selectedAttackIds?: string[];
  activeProposalId?: string;
}

export class DirectorChatController {
  public readonly workspaceId: string;
  public readonly conversationId: string;
  private readonly apiClient: ApiClient;
  private readonly markdownRenderer: MarkdownRenderer;
  private state: DirectorChatState;
  private currentSnapshotHash: string;
  private activeAbortController?: AbortController;

  constructor(props: DirectorChatProps) {
    this.workspaceId = props.workspaceId;
    this.conversationId = props.conversationId || `conv_${props.workspaceId}_${Date.now()}`;
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.markdownRenderer = new MarkdownRenderer();
    this.currentSnapshotHash = props.currentSnapshotHash ?? "snap-uncommitted";
    this.state = {
      workspaceId: props.workspaceId,
      conversationId: this.conversationId,
      messages: props.initialMessages ?? [
        {
          id: "msg-welcome",
          role: "system",
          content: `Combat Director connected to workspace [${props.workspaceId}]. Context active. Ready for combat analysis, frame data, simulation, and balance tuning.`,
          content_format: "markdown",
          status: "completed",
          timestamp: new Date().toISOString(),
        },
      ],
      isWaitingForLlm: false,
      processingState: "IDLE",
      activities: [],
      selectedAttackIds: props.selectedAttackIds ?? [],
      activeProposalId: props.activeProposalId,
    };
  }

  public getState(): DirectorChatState {
    return { ...this.state };
  }

  public getProcessingState(): ChatProcessingState {
    return this.state.processingState;
  }

  public getActivities(): PublicActivity[] {
    return [...this.state.activities];
  }

  public setSelectedAttacks(attackIds: string[]): void {
    this.state.selectedAttackIds = [...attackIds];
  }

  public setActiveProposal(proposalId?: string): void {
    this.state.activeProposalId = proposalId;
  }

  public setSnapshotHash(hash: string): void {
    this.currentSnapshotHash = hash;
  }

  public buildContextEnvelope(userPrompt: string): LlmPromptContextEnvelope {
    return {
      workspace_id: this.workspaceId,
      conversation_id: this.conversationId,
      snapshot_hash: this.currentSnapshotHash,
      selected_attack_ids: [...this.state.selectedAttackIds],
      active_proposal_id: this.state.activeProposalId,
      user_prompt: userPrompt,
      timestamp: new Date().toISOString(),
      history: this.state.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    };
  }

  public addUserMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content,
      content_format: "markdown",
      status: "completed",
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public addAssistantResponse(
    content: string,
    toolCalls?: ToolCallPreview[],
    proposedProposal?: any,
    activities?: PublicActivity[]
  ): ChatMessage {
    // Sanitize any forbidden execution phrases
    const cleanContent = this.sanitizeExecutionPhrases(content);

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content: cleanContent,
      content_format: "markdown",
      status: "completed",
      toolCalls,
      activities,
      proposedProposal,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public async sendMessage(prompt: string): Promise<DirectorChatResponse> {
    this.addUserMessage(prompt);
    this.state.isWaitingForLlm = true;
    this.state.processingState = "SUBMITTING";
    this.state.activities = [];
    this.state.error = undefined;

    // Transition to ANALYZING / FORMULATING immediately for user feedback
    this.state.processingState = "ANALYZING";

    const envelope = this.buildContextEnvelope(prompt);
    this.activeAbortController = new AbortController();

    try {
      this.state.processingState = "FORMULATING";

      const data: DirectorChatResponse = await this.apiClient.sendChatMessage(
        this.workspaceId,
        prompt,
        {
          snapshot_hash: envelope.snapshot_hash,
          selected_attack_ids: envelope.selected_attack_ids,
          active_proposal_id: envelope.active_proposal_id,
        }
      );

      if (data.activities && data.activities.length > 0) {
        this.state.activities = data.activities;
      }

      this.addAssistantResponse(data.reply, data.tool_calls, data.proposed_proposal, data.activities);
      this.state.isWaitingForLlm = false;
      this.state.processingState = "COMPLETED";
      return data;
    } catch (err: any) {
      this.state.isWaitingForLlm = false;
      if (err.name === "AbortError" || (this.state.processingState as ChatProcessingState) === "CANCELLED") {
        this.state.processingState = "CANCELLED";
        const cancelMsg: ChatMessage = {
          id: `msg-cancel-${Date.now()}`,
          role: "assistant",
          content: "Operação cancelada pelo usuário.",
          content_format: "markdown",
          status: "cancelled",
          timestamp: new Date().toISOString(),
        };
        this.state.messages.push(cancelMsg);
        return {
          workspace_id: this.workspaceId,
          processing_state: "CANCELLED",
          reply: "Operação cancelada pelo usuário.",
          context_envelope: envelope,
        };
      }

      this.state.processingState = "ERROR";
      this.state.error = err?.message || "Falha na comunicação com o Combat Director.";
      this.addAssistantResponse(
        `Não foi possível concluir a análise porque um serviço necessário está indisponível no momento. Tente novamente em instantes.`
      );
      throw err;
    } finally {
      this.activeAbortController = undefined;
    }
  }

  public cancelMessage(): void {
    if (this.state.isWaitingForLlm) {
      this.state.processingState = "CANCELLED";
      this.state.isWaitingForLlm = false;
      if (this.activeAbortController) {
        this.activeAbortController.abort();
      }
    }
  }

  private sanitizeExecutionPhrases(text: string): string {
    return text
      .replace(/Comando executado\.?/gi, "Análise concluída.")
      .replace(/Alteração aplicada\.?/gi, "Proposta gerada.")
      .replace(/Gate aprovado\.?/gi, "Validação concluída.")
      .replace(/Projeto atualizado\.?/gi, "Avaliação concluída.");
  }

  public renderModel() {
    return {
      column: "right" as const,
      workspaceId: this.workspaceId,
      conversationId: this.conversationId,
      messageCount: this.state.messages.length,
      messages: this.state.messages,
      isWaiting: this.state.isWaitingForLlm,
      processingState: this.state.processingState,
      activities: this.state.activities,
      context: {
        snapshotHash: this.currentSnapshotHash,
        selectedAttacksCount: this.state.selectedAttackIds.length,
        selectedAttackIds: [...this.state.selectedAttackIds],
        activeProposalId: this.state.activeProposalId ?? null,
      },
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const messagesHtml = model.messages
      .map((m) => {
        const renderedContent =
          m.content_format === "markdown" || m.role === "assistant"
            ? this.markdownRenderer.render(m.content)
            : m.content;

        const activitiesHtml = (m.activities || [])
          .map(
            (act) => `
              <div class="activity-indicator status-${act.status}">
                <span class="activity-dot">●</span>
                <span class="activity-label">${act.label}</span>
              </div>`
          )
          .join("\n");

        const toolsHtml = (m.toolCalls || [])
          .map((t) => {
            const toolName = t.tool_id || t.toolName || "tool";
            return `
              <div class="tool-preview-card">
                <span class="tool-name">⚡ ${toolName}</span>
                ${t.untrusted_text ? `<span class="badge badge-untrusted">untrusted_text</span>` : ""}
                ${t.verdict ? `<span class="badge badge-${t.verdict.toLowerCase()}">${t.verdict}</span>` : ""}
                <pre class="tool-output"><code>${JSON.stringify(t.output || {}, null, 2)}</code></pre>
              </div>`;
          })
          .join("\n");

        const proposalId = m.proposedProposal
          ? (m.proposedProposal.proposal_id || m.proposedProposal.proposal_id || m.proposedProposal.id || "")
          : "";
        const proposalHtml = m.proposedProposal
          ? `
            <div class="proposal-card">
              <h4>Suggested Adjustment: <code>${proposalId}</code></h4>
              <p>Target Revision: ${m.proposedProposal.target_revision}</p>
              <a class="btn btn-sm btn-outline" href="#/proposals/${proposalId}">Review Diff →</a>
            </div>`
          : "";

        return `
          <div class="chat-message message-${m.role}" data-status="${m.status || "completed"}">
            <div class="message-meta"><span class="message-role">${m.role.toUpperCase()}</span> <span class="message-time">${m.timestamp}</span></div>
            <div class="message-body">${renderedContent}</div>
            ${activitiesHtml}
            ${toolsHtml}
            ${proposalHtml}
          </div>
        `;
      })
      .join("\n");

    const processingIndicatorHtml = model.isWaiting
      ? `
        <div class="chat-processing-indicator state-${model.processingState.toLowerCase()}">
          <span class="pulse-dot">●</span>
          <span class="status-text">${this.getProcessingStateLabel(model.processingState)}</span>
        </div>`
      : "";

    return `
      <section class="director-chat" data-workspace="${model.workspaceId}" data-processing-state="${model.processingState}">
        <header class="chat-header">
          <h3>Combat Director</h3>
          <div class="chat-context-badge">
            <span>Context: [${model.context.selectedAttacksCount} attacks queued]</span>
          </div>
        </header>

        <div class="chat-messages-container">
          ${messagesHtml}
          ${processingIndicatorHtml}
        </div>

        <form class="chat-input-form" onsubmit="return false;">
          <input type="text" class="chat-input" placeholder="Ask director to tune frame data, simulate, or propose changes..." />
          <button type="submit" class="btn btn-primary" ${model.isWaiting ? "disabled" : ""}>Send</button>
          ${model.isWaiting ? `<button type="button" class="btn btn-cancel" onclick="return false;">Cancel</button>` : ""}
        </form>
      </section>
    `;
  }

  private getProcessingStateLabel(state: ChatProcessingState): string {
    switch (state) {
      case "SUBMITTING":
        return "Enviando solicitação...";
      case "ANALYZING":
        return "Analisando contexto de combate...";
      case "CALLING_TOOL":
        return "Consultando ferramentas autorizadas...";
      case "PROCESSING_RESULT":
        return "Avaliando evidências mecânicas...";
      case "FORMULATING":
        return "Formulando recomendação...";
      case "CANCELLED":
        return "Operação cancelada.";
      case "ERROR":
        return "Erro no processamento.";
      default:
        return "Processando...";
    }
  }
}
