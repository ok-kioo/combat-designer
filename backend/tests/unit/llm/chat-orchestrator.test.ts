/**
 * SPEC 11 — Unit tests for ChatOrchestrator.
 *
 * Tests: 11.U.1 through 11.U.5
 * All tests use a mock LlmProvider — no real API calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ChatOrchestrator,
  MAX_TOOL_CALL_ROUNDS,
  type ChatContextEnvelope,
  type ChatOrchestratorPorts,
} from "../../../src/modules/llm/service/chat-orchestrator.js";
import { getCombatToolDeclarations } from "../../../src/modules/llm/service/combat-tool-declarations.js";
import type { LlmProvider, LlmTurnResult, LlmChatRequest } from "../../../src/modules/llm/domain/port/llm-provider.js";

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
    gatePort: {
      verify: vi.fn().mockResolvedValue({
        gate_run_id: "gate_001",
        verdict: "PASS",
        gate_result_hash: "hash_gate",
        violations: [],
        checks: [{ name: "dps_check", result: "pass" }],
      }),
    } as any,
    saveChangeset: vi.fn(),
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
    it("returns 7 tool declarations with valid schemas", () => {
      const tools = getCombatToolDeclarations("ws_test");

      expect(tools).toHaveLength(7);
      const names = tools.map((t) => t.name);
      expect(names).toContain("combat_search");
      expect(names).toContain("combat_simulate");
      expect(names).toContain("combat_verify");
      expect(names).toContain("combat_propose_change");
      expect(names).toContain("combat_explain_gate");
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
            function_calls: [{ name: "combat_search", args: { query: "punch", tag: "melee", limit: 5 } }],
            finished: false,
          };
        }
        return { text: "Found 1 attack matching your query.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(ports.queryPort!.searchAttacks).toHaveBeenCalledWith({
        workspace_id: "ws_test",
        query: "punch",
        tag: "melee",
        min_cancel_window: undefined,
        limit: 5,
      });
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_id).toBe("combat_search");
      expect(result.reply).toContain("Found 1 attack");
    });
  });

  // 11.U.3 — Preserves untrusted_text in results
  describe("11.U.3 — untrusted_text preservation", () => {
    it("marks search results with untrusted_text: true", async () => {
      const ports = createMockPorts();
      let callCount = 0;
      const provider = createMockLlmProvider(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "combat_search", args: { query: "all" } }],
            finished: false,
          };
        }
        return { text: "Results found.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(result.tool_calls[0].untrusted_text).toBe(true);
    });
  });

  // 11.U.4 — Rejects unknown tool
  describe("11.U.4 — Unknown tool rejection", () => {
    it("returns error for tool not in registry", async () => {
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
        return { text: "Done.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].tool_id).toBe("nonexistent_tool");
      expect((result.tool_calls[0].output as any).error).toContain("Unknown tool");
    });
  });

  // 11.U.5 — Preserves mechanical gate verdict
  describe("11.U.5 — Mechanical gate verdict preservation", () => {
    it("returns gate verdict unmodified from combat_verify", async () => {
      const ports = createMockPorts({
        gatePort: {
          verify: vi.fn().mockResolvedValue({
            gate_run_id: "gate_fail_001",
            verdict: "FAIL",
            gate_result_hash: "hash_fail",
            violations: [{ rule: "max_dps", message: "DPS exceeded" }],
            checks: [{ name: "dps_check", result: "fail" }],
          }),
        } as any,
      });
      let callCount = 0;
      const provider = createMockLlmProvider(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            text: null,
            function_calls: [{ name: "combat_verify", args: { project_id: "proj_1" } }],
            finished: false,
          };
        }
        return { text: "Gate failed.", function_calls: [], finished: true };
      });

      const orchestrator = new ChatOrchestrator(provider, ports);
      const result = await orchestrator.processMessage(createMockEnvelope());

      expect(result.tool_calls).toHaveLength(1);
      const output = result.tool_calls[0].output as any;
      expect(output.source).toBe("mechanical_gate");
      expect(output.verdict).toBe("FAIL");
      expect(output.violations).toHaveLength(1);
    });
  });
});
