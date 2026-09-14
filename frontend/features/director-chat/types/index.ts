export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export type ChatProcessingState =
  | "IDLE"
  | "SUBMITTING"
  | "ANALYZING"
  | "CALLING_TOOL"
  | "PROCESSING_RESULT"
  | "FORMULATING"
  | "COMPLETED"
  | "ERROR"
  | "CANCELLED";

export interface PublicActivity {
  activity_id: string;
  status: "started" | "completed" | "failed" | "cancelled";
  label: string;
}

export type PublicChatErrorCode =
  | "OUT_OF_SCOPE"
  | "AMBIGUOUS_REQUEST"
  | "CONTEXT_UNAVAILABLE"
  | "RESOURCE_NOT_FOUND"
  | "TOOL_DENIED"
  | "SIMULATION_FAILED"
  | "VALIDATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "CONTEXT_LIMIT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ToolCallPreview {
  tool_id?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  verdict?: "PASS" | "FAIL" | "BLOCKED" | "STALE" | "BUDGET_EXCEEDED";
  untrusted_text?: boolean;
}

export interface ProposedProposalCard {
  proposal_id: string;
  id?: string;
  target_revision: string;
  mutations: Array<{
    type: string;
    attack_id: string;
    proposed_damage?: number;
    proposed_recovery_frames?: number;
    reason: string;
  }>;
}

export type ProposalAdjustmentCard = ProposedProposalCard;

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  content_format?: "markdown";
  status?: "pending" | "streaming" | "completed" | "error" | "cancelled";
  toolCalls?: ToolCallPreview[];
  activities?: PublicActivity[];
  proposedProposal?: ProposedProposalCard;
  timestamp: string;
}

export interface LlmPromptContextEnvelope {
  workspace_id: string;
  conversation_id?: string;
  snapshot_hash: string;
  selected_attack_ids: string[];
  active_proposal_id?: string;
  user_prompt: string;
  timestamp: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface DirectorChatResponse {
  message_id?: string;
  conversation_id?: string;
  workspace_id: string;
  processing_state?: ChatProcessingState;
  intent?: string;
  reply: string;
  reply_details?: {
    content: string;
    content_format: "markdown";
  };
  activities?: PublicActivity[];
  tool_calls?: ToolCallPreview[];
  proposed_proposal?: any;
  context_envelope: LlmPromptContextEnvelope;
  error?: {
    code: PublicChatErrorCode;
    message: string;
  };
}

export interface DirectorChatState {
  workspaceId: string;
  conversationId: string;
  messages: ChatMessage[];
  isWaitingForLlm: boolean;
  processingState: ChatProcessingState;
  activities: PublicActivity[];
  selectedAttackIds: string[];
  activeProposalId?: string;
  error?: string;
}
