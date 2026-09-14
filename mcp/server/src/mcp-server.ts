import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpGatewayRouter } from "../../gateway/src/routing/router.js";
import { ResourceProvider } from "./resources/resource-provider.js";
import type { ApplicationAdapter } from "./adapters/application-adapter.js";
import { createToolHandlers } from "./tools/handlers.js";
import { LlmOrchestrator } from "./orchestration/llm-orchestrator.js";
import type { Principal } from "@combat-designer/backend";

export class CombatDesignerMcpServer {
  readonly sdkServer: McpServer;
  readonly resourceProvider: ResourceProvider;
  readonly orchestrator: LlmOrchestrator;

  constructor(
    readonly gateway: McpGatewayRouter,
    readonly adapter: ApplicationAdapter
  ) {
    this.sdkServer = new McpServer({
      name: "combat-designer",
      version: "0.1.0",
    });

    this.resourceProvider = new ResourceProvider(adapter);
    this.orchestrator = new LlmOrchestrator(gateway, adapter);

    this.registerGatewayHandlers();
    this.registerSdkTools();
  }

  private registerGatewayHandlers(): void {
    const handlers = createToolHandlers(this.adapter);
    for (const [toolId, handler] of Object.entries(handlers)) {
      this.gateway.registerHandler(toolId as any, handler);
    }
  }

  private registerSdkTools(): void {
    const tools = this.gateway.toolRegistry.getAllTools();
    for (const tool of tools) {
      // Register with MCP SDK
      this.sdkServer.tool(
        tool.tool_id,
        {},
        async (args: any, extra: any) => {
          // Contextual principal passed via extra or default caller context
          const principal: Principal = extra?.principal ?? {
            principal_id: "default_caller",
            principal_type: "human",
            capabilities: ["combat:read", "combat:query", "combat:simulate", "combat:analyze", "combat:propose", "proposal:withdraw"],
            authorized_workspaces: [args?.workspace_id || "default"],
          };

          const result = await this.gateway.execute(principal, tool.tool_id, args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
          };
        }
      );
    }
  }
}
