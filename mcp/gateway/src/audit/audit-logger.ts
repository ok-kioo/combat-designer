import type { AuditEvent, Principal } from "@combat-designer/backend";
import { redactSensitiveData } from "@combat-designer/backend";
import crypto from "node:crypto";

export class GatewayAuditLogger {
  private events: AuditEvent[] = [];

  logEvent(params: {
    correlation_id: string;
    principal: Principal;
    workspace_id: string;
    operation: string;
    tool_name: string;
    authorization_decision: "ALLOW" | "DENY";
    request_payload: unknown;
    response_payload?: unknown;
    result_status: string;
    error_code?: string;
  }): AuditEvent {
    const redactedRequest = redactSensitiveData(params.request_payload);
    const redactedResponse = redactSensitiveData(params.response_payload ?? {});

    const requestJson = JSON.stringify(redactedRequest);
    const responseJson = JSON.stringify(redactedResponse);

    const requestHash = crypto.createHash("sha256").update(requestJson).digest("hex");
    const responseHash = crypto.createHash("sha256").update(responseJson).digest("hex");

    const event: AuditEvent = {
      correlation_id: params.correlation_id,
      principal_id: params.principal.principal_id,
      principal_type: params.principal.principal_type,
      workspace_id: params.workspace_id,
      operation: params.operation,
      tool_name: params.tool_name,
      authorization_decision: params.authorization_decision,
      request_hash: requestHash,
      response_hash: responseHash,
      result_status: params.result_status,
      timestamp: new Date().toISOString(),
      error_code: params.error_code,
    };

    this.events.push(event);
    return event;
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
