import type { Principal, AuthorizationDecision } from "@combat-designer/backend";
import type { ToolRegistration } from "../capabilities/registry.js";

export interface AuthorizationContext {
  principal: Principal;
  workspace_id: string;
  tool: ToolRegistration;
  correlation_id: string;
}

export class PolicyEngine {
  authorize(context: AuthorizationContext): AuthorizationDecision {
    const { principal, workspace_id, tool } = context;

    // Invariant GW-I01: Identifiable principal
    if (!principal || !principal.principal_id) {
      return { allowed: false, reason: "Unauthenticated caller.", code: "UNAUTHENTICATED" };
    }

    // Invariant GW-I02 & GW-I03: Workspace check
    if (tool.workspace_required) {
      if (!workspace_id || workspace_id.trim() === "") {
        return { allowed: false, reason: "workspace_id is strictly required.", code: "WORKSPACE_REQUIRED" };
      }
      if (!principal.authorized_workspaces.includes(workspace_id) && !principal.authorized_workspaces.includes("*")) {
        return {
          allowed: false,
          reason: `Principal '${principal.principal_id}' is not authorized for workspace '${workspace_id}'.`,
          code: "UNAUTHORIZED",
        };
      }
    }

    // Invariant GW-I06: LLM default policy denies apply & admin & approve
    if (principal.principal_type === "llm") {
      if (tool.capability_required === "changeset:apply" || tool.mutability === "WRITE") {
        return {
          allowed: false,
          reason: "LLM default policy: changeset:apply is strictly DENIED.",
          code: "POLICY_DENIED",
        };
      }
      if (tool.capability_required === "changeset:approve") {
        return {
          allowed: false,
          reason: "LLM cannot approve changesets. Human approval is strictly required.",
          code: "POLICY_DENIED",
        };
      }
      if (tool.capability_required.startsWith("admin:")) {
        return {
          allowed: false,
          reason: "LLM default policy: admin:* capabilities are strictly DENIED.",
          code: "POLICY_DENIED",
        };
      }
    }

    // Invariant GW-I05: Required capability check
    const hasCapability =
      principal.capabilities.includes(tool.capability_required) ||
      principal.capabilities.includes("admin:policy");

    if (!hasCapability) {
      return {
        allowed: false,
        reason: `Principal '${principal.principal_id}' lacks required capability '${tool.capability_required}'.`,
        code: "UNAUTHORIZED",
      };
    }

    return { allowed: true };
  }
}
