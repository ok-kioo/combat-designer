import { McpError, type McpErrorEnvelope } from "@combat-designer/backend";

export class McpErrorTranslator {
  translate(error: unknown): McpErrorEnvelope {
    if (error instanceof McpError) {
      return error.toEnvelope();
    }

    const err = error as Error;
    return {
      code: "INTERNAL_ERROR",
      message: err.message || "An unexpected error occurred",
      retryable: false,
    };
  }
}
