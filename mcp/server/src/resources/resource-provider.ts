import {
  parseResourceUri,
  type ResourceEnvelope,
  type Principal,
  McpError,
} from "@combat-designer/backend";
import type { ApplicationAdapter } from "../adapters/application-adapter.js";

export class ResourceProvider {
  constructor(private adapter: ApplicationAdapter) {}

  async readResource(uri: string, principal: Principal): Promise<ResourceEnvelope> {
    const parsed = parseResourceUri(uri);

    // Workspace authorization
    if (!principal.authorized_workspaces.includes(parsed.workspace_id)) {
      throw new McpError(
        "UNAUTHORIZED",
        `Principal '${principal.principal_id}' is not authorized to read resources in workspace '${parsed.workspace_id}'.`
      );
    }

    switch (parsed.resource_type) {
      case "attacks": {
        const attack = await this.adapter.getAttack(parsed.workspace_id, parsed.resource_id);
        if (!attack) {
          throw new McpError("RESOURCE_NOT_FOUND", `Attack '${parsed.resource_id}' not found in workspace '${parsed.workspace_id}'.`);
        }
        return {
          uri,
          classification: "FACT",
          data: attack,
          untrusted_text: true,
          source: "combat_designer_catalog",
        };
      }

      case "provenance": {
        const prov = await this.adapter.getProvenance(parsed.workspace_id, parsed.resource_id);
        if (!prov) {
          throw new McpError("RESOURCE_NOT_FOUND", `Provenance for '${parsed.resource_id}' not found.`);
        }
        return {
          uri,
          classification: "FACT",
          data: prov,
          untrusted_text: true,
          source: "combat_designer_provenance",
        };
      }

      case "graph": {
        const impact = await this.adapter.getImpactAnalysis(parsed.workspace_id, parsed.resource_id);
        return {
          uri,
          classification: "FACT",
          data: impact,
          untrusted_text: false,
          source: "combat_designer_graph",
        };
      }

      case "verification": {
        return {
          uri,
          classification: "SIMULATION_RESULT",
          data: {
            gate_run_id: parsed.resource_id,
            workspace_id: parsed.workspace_id,
          },
          untrusted_text: false,
          source: "combat_designer_verification",
        };
      }

      case "archetypes": {
        return {
          uri,
          classification: "FACT",
          data: {
            archetype_id: parsed.resource_id,
            workspace_id: parsed.workspace_id,
          },
          untrusted_text: true,
          source: "combat_designer_archetypes",
        };
      }

      default:
        throw new McpError("RESOURCE_NOT_FOUND", `Unknown resource type in URI '${uri}'.`);
    }
  }
}
