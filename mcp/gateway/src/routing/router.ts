import type { Principal, CanonicalToolName } from "@combat-designer/backend";
import { McpError } from "@combat-designer/backend";
import { GatewayAuthenticator } from "../auth/authenticator.js";
import { GatewayWorkspaceGuard } from "../workspace/workspace-guard.js";
import { ToolRegistry, type ToolRegistration } from "../capabilities/registry.js";
import { PolicyEngine } from "../policy/policy-engine.js";
import { GatewayExecutionLimiter } from "../limits/rate-limiter.js";
import { GatewayRequestValidator } from "../validation/request-validator.js";
import { GatewayAuditLogger } from "../audit/audit-logger.js";
import crypto from "node:crypto";

export interface AuthorizedToolCallContext {
  principal: Principal;
  workspace_id: string;
  tool: ToolRegistration;
  correlation_id: string;
  validated_params: Record<string, unknown>;
}

export type ToolHandler = (context: AuthorizedToolCallContext) => Promise<unknown>;

export interface GatewayExecutionOptions {
  correlation_id?: string;
  requested_workspace_id?: string;
  recursion_depth?: number;
}

export interface GatewayExecutionResult {
  tool_id: CanonicalToolName;
  classification: string;
  data: unknown;
  source: string;
  correlation_id: string;
}

export class McpGatewayRouter {
  readonly authenticator = new GatewayAuthenticator();
  readonly workspaceGuard = new GatewayWorkspaceGuard();
  readonly toolRegistry = new ToolRegistry();
  readonly policyEngine = new PolicyEngine();
  readonly limiter = new GatewayExecutionLimiter();
  readonly validator = new GatewayRequestValidator();
  readonly auditLogger = new GatewayAuditLogger();

  private handlers = new Map<CanonicalToolName, ToolHandler>();

  registerHandler(toolId: CanonicalToolName, handler: ToolHandler): void {
    this.handlers.set(toolId, handler);
  }

  async execute(
    principalCandidate: unknown,
    toolNameOrAlias: string,
    rawParams: unknown,
    options: GatewayExecutionOptions = {}
  ): Promise<GatewayExecutionResult> {
    const correlation_id = options.correlation_id || `corr_${crypto.randomUUID().slice(0, 8)}`;
    let principal: Principal | null = null;
    let workspace_id = "";

    try {
      // 1. Authenticate Principal
      principal = this.authenticator.authenticate(principalCandidate);

      // 2. Resolve Tool in Registry
      const tool = this.toolRegistry.resolveTool(toolNameOrAlias);
      if (!tool) {
        throw new McpError(
          "POLICY_DENIED",
          `Unknown or unregistered tool '${toolNameOrAlias}'. Deny-by-default applied.`
        );
      }

      // 3. Rate and Recursion Limits
      this.limiter.checkRateLimit(principal.principal_id);
      this.limiter.checkRecursionDepth(options.recursion_depth ?? 0);
      this.limiter.checkRequestSize(rawParams);

      const paramsObj = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      this.limiter.checkBudgetBounds(paramsObj);

      // 4. Resolve and Validate Workspace
      const payloadWorkspaceId = typeof paramsObj.workspace_id === "string" ? paramsObj.workspace_id : undefined;
      workspace_id = this.workspaceGuard.validateWorkspaceAccess(
        principal,
        options.requested_workspace_id,
        payloadWorkspaceId
      );

      // 5. Authorize Capability & Policy
      const authDecision = this.policyEngine.authorize({
        principal,
        workspace_id,
        tool,
        correlation_id,
      });

      if (!authDecision.allowed) {
        throw new McpError(
          (authDecision.code as any) || "UNAUTHORIZED",
          authDecision.reason
        );
      }

      // 6. Validate Request Payload Schema
      const validated_params = this.validator.validatePayload(
        tool.input_schema,
        rawParams
      ) as Record<string, unknown>;

      // 7. Resolve Handler
      const handler = this.handlers.get(tool.tool_id);
      if (!handler) {
        throw new McpError(
          "INTERNAL_ERROR",
          `No registered handler implementation for tool '${tool.tool_id}'.`
        );
      }

      // 8. Execute Forwarded Request via Handler
      const data = await handler({
        principal,
        workspace_id,
        tool,
        correlation_id,
        validated_params,
      });

      // 9. Audit Success
      this.auditLogger.logEvent({
        correlation_id,
        principal,
        workspace_id,
        operation: `tool_call:${tool.tool_id}`,
        tool_name: tool.tool_id,
        authorization_decision: "ALLOW",
        request_payload: rawParams,
        response_payload: data,
        result_status: "SUCCESS",
      });

      return {
        tool_id: tool.tool_id,
        classification: tool.output_classification,
        data,
        source: "combat_designer_application",
        correlation_id,
      };
    } catch (error) {
      const mcpError =
        error instanceof McpError
          ? error
          : new McpError("INTERNAL_ERROR", (error as Error).message || "Internal gateway error");

      // Audit Failure / Denial
      if (principal) {
        this.auditLogger.logEvent({
          correlation_id,
          principal,
          workspace_id: workspace_id || "unknown",
          operation: `tool_call:${toolNameOrAlias}`,
          tool_name: toolNameOrAlias,
          authorization_decision: "DENY",
          request_payload: rawParams,
          result_status: "ERROR",
          error_code: mcpError.code,
        });
      }

      throw mcpError;
    }
  }
}
