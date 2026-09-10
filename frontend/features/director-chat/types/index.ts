export type ChatMessageRole = "user" | "assistant" | "system" | "tool";

export interface ToolCallPreview {
  toolName: string;
  arguments: Record<string, unknown>;
  verdict?: "PASS" | "FAIL" | "BLOCKED";
  output?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  toolCalls?: ToolCallPreview[];
  timestamp: string;
}

export interface DirectorChatState {
  workspaceId: string;
  messages: ChatMessage[];
  isWaitingForLlm: boolean;
}
