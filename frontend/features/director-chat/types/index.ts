export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ToolCallPreview {
  tool_id?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  verdict?: "PASS" | "FAIL" | "BLOCKED" | "STALE" | "BUDGET_EXCEEDED";
  untrusted_text?: boolean;
}

export interface ProposedChangesetCard {
  changeset_id: string;
  target_revision: string;
  mutations: Array<{
    type: string;
    attack_id: string;
    proposed_damage?: number;
    proposed_recovery_frames?: number;
    reason: string;
  }>;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  toolCalls?: ToolCallPreview[];
  proposedChangeset?: ProposedChangesetCard;
  timestamp: string;
}

export interface LlmPromptContextEnvelope {
  workspace_id: string;
  snapshot_hash: string;
  selected_attack_ids: string[];
  active_changeset_id?: string;
  user_prompt: string;
  timestamp: string;
}

export interface DirectorChatResponse {
  workspace_id: string;
  reply: string;
  tool_calls?: ToolCallPreview[];
  proposed_changeset?: any;
  context_envelope: LlmPromptContextEnvelope;
}

export interface DirectorChatState {
  workspaceId: string;
  messages: ChatMessage[];
  isWaitingForLlm: boolean;
  selectedAttackIds: string[];
  activeChangesetId?: string;
  error?: string;
}
