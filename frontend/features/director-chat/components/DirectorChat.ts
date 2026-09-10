import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type {
  DirectorChatState,
  ChatMessage,
  ToolCallPreview,
  LlmPromptContextEnvelope,
  DirectorChatResponse,
} from "../types/index.js";

export interface DirectorChatProps {
  workspaceId: string;
  apiClient?: ApiClient;
  initialMessages?: ChatMessage[];
  currentSnapshotHash?: string;
  selectedAttackIds?: string[];
  activeChangesetId?: string;
}

export class DirectorChatController {
  public readonly workspaceId: string;
  private readonly apiClient: ApiClient;
  private state: DirectorChatState;
  private currentSnapshotHash: string;

  constructor(props: DirectorChatProps) {
    this.workspaceId = props.workspaceId;
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.currentSnapshotHash = props.currentSnapshotHash ?? "snap-uncommitted";
    this.state = {
      workspaceId: props.workspaceId,
      messages: props.initialMessages ?? [
        {
          id: "msg-welcome",
          role: "system",
          content: `Combat Director connected to workspace [${props.workspaceId}]. Context active. Ready for tuning, verification, and changeset proposals.`,
          timestamp: new Date().toISOString(),
        },
      ],
      isWaitingForLlm: false,
      selectedAttackIds: props.selectedAttackIds ?? [],
      activeChangesetId: props.activeChangesetId,
    };
  }

  public getState(): DirectorChatState {
    return { ...this.state };
  }

  public setSelectedAttacks(attackIds: string[]): void {
    this.state.selectedAttackIds = [...attackIds];
  }

  public setActiveChangeset(changesetId?: string): void {
    this.state.activeChangesetId = changesetId;
  }

  public setSnapshotHash(hash: string): void {
    this.currentSnapshotHash = hash;
  }

  public buildContextEnvelope(userPrompt: string): LlmPromptContextEnvelope {
    return {
      workspace_id: this.workspaceId,
      snapshot_hash: this.currentSnapshotHash,
      selected_attack_ids: [...this.state.selectedAttackIds],
      active_changeset_id: this.state.activeChangesetId,
      user_prompt: userPrompt,
      timestamp: new Date().toISOString(),
    };
  }

  public addUserMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public addAssistantResponse(
    content: string,
    toolCalls?: ToolCallPreview[],
    proposedChangeset?: any
  ): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "assistant",
      content,
      toolCalls,
      proposedChangeset,
      timestamp: new Date().toISOString(),
    };
    this.state.messages.push(message);
    return message;
  }

  public async sendMessage(prompt: string): Promise<DirectorChatResponse> {
    this.addUserMessage(prompt);
    this.state.isWaitingForLlm = true;
    this.state.error = undefined;

    const envelope = this.buildContextEnvelope(prompt);

    try {
      const data: DirectorChatResponse = await this.apiClient.sendChatMessage(
        this.workspaceId,
        prompt,
        {
          snapshot_hash: envelope.snapshot_hash,
          selected_attack_ids: envelope.selected_attack_ids,
          active_changeset_id: envelope.active_changeset_id,
        }
      );

      this.addAssistantResponse(data.reply, data.tool_calls, data.proposed_changeset);
      this.state.isWaitingForLlm = false;
      return data;
    } catch (err: any) {
      this.state.isWaitingForLlm = false;
      this.state.error = err?.message || "Failed to communicate with Combat Director";
      this.addAssistantResponse(
        `Communication error: ${this.state.error}. Please check backend connection.`
      );
      throw err;
    }
  }

  public renderModel() {
    return {
      column: "right" as const,
      workspaceId: this.workspaceId,
      messageCount: this.state.messages.length,
      messages: this.state.messages,
      isWaiting: this.state.isWaitingForLlm,
      context: {
        snapshotHash: this.currentSnapshotHash,
        selectedAttacksCount: this.state.selectedAttackIds.length,
        selectedAttackIds: [...this.state.selectedAttackIds],
        activeChangesetId: this.state.activeChangesetId ?? null,
      },
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const messagesHtml = model.messages
      .map((m) => {
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

        const proposalHtml = m.proposedChangeset
          ? `
            <div class="changeset-card">
              <h4>Proposed ChangeSet: <code>${m.proposedChangeset.changeset_id}</code></h4>
              <p>Target Revision: ${m.proposedChangeset.target_revision}</p>
              <a class="btn btn-sm btn-outline" href="#/changesets/${m.proposedChangeset.changeset_id}">Review Diff →</a>
            </div>`
          : "";

        return `
          <div class="chat-message message-${m.role}">
            <div class="message-meta"><span class="message-role">${m.role.toUpperCase()}</span> <span class="message-time">${m.timestamp}</span></div>
            <div class="message-body">${m.content}</div>
            ${toolsHtml}
            ${proposalHtml}
          </div>
        `;
      })
      .join("\n");

    return `
      <section class="director-chat" data-workspace="${model.workspaceId}">
        <header class="chat-header">
          <h3>Combat Director</h3>
          <div class="chat-context-badge">
            <span>Context: [${model.context.selectedAttacksCount} attacks queued]</span>
          </div>
        </header>

        <div class="chat-messages-container">
          ${messagesHtml}
          ${model.isWaiting ? `<div class="chat-typing"><em>Director is thinking & evaluating mechanics...</em></div>` : ""}
        </div>

        <form class="chat-input-form" onsubmit="return false;">
          <input type="text" class="chat-input" placeholder="Ask director to tune frame data, simulate, or propose changes..." />
          <button type="submit" class="btn btn-primary" ${model.isWaiting ? "disabled" : ""}>Send</button>
        </form>
      </section>
    `;
  }
}
