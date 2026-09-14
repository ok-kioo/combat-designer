import { describe, it, expect, vi } from "vitest";
import { ChatOrchestrator } from "../../../src/modules/llm/service/chat-orchestrator.js";
import type {
  ChatContextEnvelope,
  ChatOrchestratorPorts,
} from "../../../src/modules/llm/service/chat-orchestrator.js";
import type {
  LlmProvider,
  LlmChatRequest,
  LlmTurnResult,
} from "../../../src/modules/llm/domain/port/llm-provider.js";
import { getCombatToolDeclarations } from "../../../src/modules/llm/service/combat-tool-declarations.js";

function createMockEnvelope(overrides: Partial<ChatContextEnvelope> = {}): ChatContextEnvelope {
  return {
    workspace_id: "ws_test",
    snapshot_hash: "snap_abc123",
    selected_attack_ids: [],
    user_prompt: "Hello Combat Director",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockPorts(overrides: Partial<ChatOrchestratorPorts> = {}): ChatOrchestratorPorts {
  return {
    queryPort: {
      searchAttacks: vi.fn().mockResolvedValue([
        { attack_id: "atk_1", name: "Light Punch", damage: 25, startup_frames: 4, active_frames: 2, recovery_frames: 8, tags: ["melee"] },
      ]),
      getAttack: vi.fn().mockResolvedValue(null),
    } as any,
    simulationPort: {
      simulate: vi.fn().mockResolvedValue({ total_frames: 120, status: "COMPLETED", final_state_hash: "hash_sim" }),
    } as any,
    analysisPort: {
      analyze: vi.fn().mockResolvedValue({
        analysis_id: "an_001",
        workspace_id: "ws_test",
        project_revision: "rev-1",
        status: "COMPLETED",
        findings: [],
        recommendations: [],
        evidence_count: 0,
        analyzed_at: new Date().toISOString(),
      }),
    } as any,
    saveProposal: vi.fn(),
    getWorkspaceRevision: vi.fn().mockReturnValue("rev-1"),
    ...overrides,
  };
}

function createMockLlmProvider(chatFn: (req: LlmChatRequest) => Promise<LlmTurnResult>): LlmProvider {
  return { chat: chatFn };
}

describe("ChatOrchestrator", () => {
  // 11.U.1 — Tool declarations are valid
  describe("11.U.1 — Combat tool declarations", () => {
    it("returns 6 tool declarations with valid schemas", () => {
      const tools = getCombatToolDeclarations("ws_test");

      expect(tools).toHaveLength(6);
      const names = tools.map((t) => t.name);
      expect(names).toContain("combat_search");
      expect(names).toContain("combat_simulate");
      expect(names).toContain("combat_analyze");
      expect(names).toContain("combat_create_proposal");
      expect(names).toContain("combat_impact_analysis");
      expect(names).toContain("list_scenarios");

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters.type).toBe("object");
      }
    });
  });

  // 11.U.2 — Executes combat_search correctly
  describe("11.U.2 — combat_search execution", () => {
    it("calls queryPort.search with correct params from function call", async () => {
      const ports = createMockPorts();
      let callCount = 0;
      const provider = createMockLlmProvider(async (req) => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "combat_search", args: { query: "Punch", limit: 5 } }],
            finished: false,
          };
        }
        return {
          text: "I found Light Punch.",
          function_calls: [],
          finished: true,
        };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope({ user_prompt: "Find punches" }));

      expect(ports.queryPort?.searchAttacks).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws_test",
          query: "Punch",
          limit: 5,
        })
      );
      expect(result.reply).toBe("I found Light Punch.");
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_id).toBe("combat_search");
    });
  });

  // 11.U.3 — Executes combat_simulate correctly
  describe("11.U.3 — combat_simulate execution", () => {
    it("calls simulationPort.simulate with correct payload", async () => {
      const ports = createMockPorts();
      let callCount = 0;
      const provider = createMockLlmProvider(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "combat_simulate", args: { scenario_id: "sc_duel_1", max_frames: 180 } }],
            finished: false,
          };
        }
        return { text: "Simulation finished.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope({ user_prompt: "Simulate duel" }));

      expect(ports.simulationPort?.simulate).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws_test",
          scenario: expect.objectContaining({ scenario_id: "sc_duel_1" }),
        })
      );
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_id).toBe("combat_simulate");
    });
  });

  // 11.U.4 — Handles unknown tool gracefully
  describe("11.U.4 — Unknown tool handling", () => {
    it("returns error result for unknown tool and continues conversation", async () => {
      const ports = createMockPorts();
      let callCount = 0;
      const provider = createMockLlmProvider(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "nonexistent_tool", args: {} }],
            finished: false,
          };
        }
        return { text: "Tool failed, recovered.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_id).toBe("nonexistent_tool");
      expect((result.tool_calls[0].output as any).error).toContain("Unknown tool");
    });
  });

  // 11.U.5 — Combat analysis findings execution
  describe("11.U.5 — Combat analysis findings execution", () => {
    it("returns diagnostic findings from combat_analyze", async () => {
      const ports = createMockPorts({
        analysisPort: {
          analyze: vi.fn().mockResolvedValue({
            analysis_id: "an_001",
            workspace_id: "ws_test",
            project_revision: "rev-1",
            status: "COMPLETED",
            findings: [{ id: "fnd_1", type: "low_recovery", severity: "high", title: "Recovery", description: "Too short", attack_ids: ["atk_1"] }],
            recommendations: [],
            evidence_count: 1,
            analyzed_at: new Date().toISOString(),
          }),
        } as any,
      });
      let callCount = 0;
      const provider = createMockLlmProvider(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "combat_analyze", args: { subject: "Recovery analysis" } }],
            finished: false,
          };
        }
        return { text: "Analysis completed.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(result.tool_calls).toHaveLength(1);
      const output = result.tool_calls[0].output as any;
      expect(output.source).toBe("combat_analysis");
      expect(output.status).toBe("COMPLETED");
      expect(output.findings).toHaveLength(1);
    });
  });
});
