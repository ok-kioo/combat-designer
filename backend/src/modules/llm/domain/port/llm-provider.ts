/**
 * LLM Provider Port — Domain abstraction for LLM API calls.
 *
 * This port decouples the orchestration layer from any concrete LLM SDK,
 * enabling easy testing (mock injection) and future provider swaps.
 */

export interface LlmToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      items?: { type: string };
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface LlmFunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface LlmToolResult {
  name: string;
  call_id?: string;
  result: unknown;
}

export interface LlmTurnResult {
  text: string | null;
  function_calls: LlmFunctionCall[];
  finished: boolean;
}

export interface LlmChatRequest {
  system_prompt: string;
  tools: LlmToolDeclaration[];
  user_message: string;
  tool_results?: LlmToolResult[];
  history?: Array<{ role: "user" | "model"; parts: Array<{ text?: string; functionCall?: LlmFunctionCall; functionResponse?: LlmToolResult }> }>;
}

export interface LlmProvider {
  /**
   * Send a chat turn to the LLM, optionally with tool results from a previous round.
   * Returns the model's response: text, function calls, or both.
   */
  chat(request: LlmChatRequest): Promise<LlmTurnResult>;
}
