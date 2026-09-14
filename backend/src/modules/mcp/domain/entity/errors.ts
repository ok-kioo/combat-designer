import { z } from "zod";

export const McpErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "WORKSPACE_REQUIRED",
  "WORKSPACE_MISMATCH",
  "RESOURCE_NOT_FOUND",
  "INVALID_REQUEST",
  "INVALID_TOOL_ARGUMENTS",
  "POLICY_DENIED",
  "RATE_LIMITED",
  "BUDGET_EXCEEDED",
  "STALE_REVISION",
  "INTERNAL_ERROR",
  "INVALID_PROPOSAL_STATE",
  "APPROVAL_REQUIRED",
  "HUMAN_APPROVAL_REQUIRED",
  "INVALID_SIMULATION_RESULT",
]);
export type McpErrorCode = z.infer<typeof McpErrorCodeSchema>;

export const McpErrorEnvelopeSchema = z.object({
  code: McpErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
}).strict();

export type McpErrorEnvelope = z.infer<typeof McpErrorEnvelopeSchema>;

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: McpErrorCode, message: string, retryable = false, details?: Record<string, unknown>) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    Object.setPrototypeOf(this, McpError.prototype);
  }

  toEnvelope(): McpErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}
