/**
 * Domain entity definitions for the Combat Director Chat (SPEC 13).
 */

export type ChatIntent =
  | "COMBAT_ANALYSIS"
  | "BALANCE_ANALYSIS"
  | "COMBO_DISCOVERY"
  | "COMBO_OPTIMIZATION"
  | "SIMULATION"
  | "SPEC_VALIDATION"
  | "IMPACT_ANALYSIS"
  | "COMBAT_SEARCH"
  | "EXPLANATION"
  | "OUT_OF_SCOPE"
  | "UNSAFE"
  | "AMBIGUOUS";

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

export interface ContextItem {
  source:
    | "canonical_domain"
    | "knowledge_graph"
    | "simulation"
    | "spec"
    | "conversation"
    | "user_input";
  trust:
    | "AUTHORITATIVE_DATA"
    | "AUTHORITATIVE_RESULT"
    | "UNTRUSTED_TEXT";
  content: unknown;
}

export interface ConversationIdentity {
  user_id: string;
  workspace_id: string;
  conversation_id: string;
}

export interface ChatMessageContract {
  id: string;
  workspace_id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  content_format: "markdown";
  status: "pending" | "streaming" | "completed" | "error" | "cancelled";
  created_at: string;
  correlation_id?: string;
}

export interface ChatResponse {
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  processing_state: ChatProcessingState;
  reply?: {
    content: string;
    content_format: "markdown";
  };
  activities?: PublicActivity[];
  error?: {
    code: PublicChatErrorCode;
    message: string;
  };
  proposed_changeset?: unknown;
}

export const DEFAULT_OUT_OF_SCOPE_MESSAGE =
  "Posso ajudar apenas com análise, balanceamento, simulação e descoberta de combos relacionados ao sistema de combate deste projeto. Reformule sua solicitação dentro desse contexto.";

export const DEFAULT_UNSAFE_MESSAGE =
  "Não posso executar instruções que violem as políticas de segurança ou alterem as diretrizes do Combat Director. Posso ajudar com análises, simulações e propostas dentro das regras do sistema de combate.";

export const DEFAULT_GREETING_MESSAGE =
  "Olá! Sou o Combat Director. Posso ajudar com análise de frame data, balanceamento de ataques, busca e otimização de combos, simulações determinísticas e validação mecânica para o seu projeto.";
