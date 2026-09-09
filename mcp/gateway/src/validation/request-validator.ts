import type { z } from "zod";
import { McpError } from "@combat-designer/shared-contracts";

export class GatewayRequestValidator {
  validatePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
    const result = schema.safeParse(payload);
    if (!result.success) {
      const issueMessages = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new McpError(
        "INVALID_TOOL_ARGUMENTS",
        `Tool arguments validation failed: ${issueMessages}`,
        false,
        { issues: result.error.issues }
      );
    }
    return result.data;
  }
}
