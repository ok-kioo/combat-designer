import { McpError, type McpErrorCode } from "@combat-designer/shared-contracts";

export class GatewaySecurityError extends McpError {
  constructor(code: McpErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, false, details);
    this.name = "GatewaySecurityError";
  }
}
