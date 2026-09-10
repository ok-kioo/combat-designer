/**
 * SPEC 11 — Integration tests for LLM chat orchestration via HTTP route.
 *
 * Tests: 11.T.1 through 11.T.7
 * All tests use a mock LlmProvider injected into ApiServer — no real Gemini API calls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { ApiServer } from "../../../src/infrastructure/http/server.js";
import type { LlmProvider, LlmChatRequest, LlmTurnResult } from "../../../src/modules/llm/domain/port/llm-provider.js";

const TEST_PORT = 3461;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const WS_ID = "ws_llm_test";

function createTestLlmProvider(
  chatFn?: (req: LlmChatRequest) => Promise<LlmTurnResult>
): LlmProvider {
  const defaultChat = async (_req: LlmChatRequest): Promise<LlmTurnResult> => ({
    text: "Hello from Combat Director LLM mock.",
    function_calls: [],
    finished: true,
  });
  return { chat: chatFn || defaultChat };
}

async function postChat(
  prompt: string,
  context: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<Response> {
  return fetch(`${BASE_URL}/api/workspaces/${WS_ID}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Authorized-Workspaces": "*",
      ...headers,
    },
    body: JSON.stringify({ prompt, context }),
  });
}

// 11.T.1 — Chat with mock LlmProvider returns text response
describe("SPEC 11 — LLM Integration Tests (with LlmProvider)", () => {
  let server: ApiServer;

  describe("11.T.1 — Text-only response", () => {
    beforeAll(async () => {
      server = new ApiServer({
        port: TEST_PORT,
        llmProvider: createTestLlmProvider(),
      });
      await server.listen();
    });

    afterAll(async () => {
      await server.close();
    });

    it("returns LLM text response with llm_orchestrated flag", async () => {
      const res = await postChat("Tell me about attack balance");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.reply).toBe("Hello from Combat Director LLM mock.");
      expect(body.tool_calls).toEqual([]);
      expect(body.llm_orchestrated).toBe(true);
      expect(body.workspace_id).toBe(WS_ID);
      expect(body.context_envelope).toBeDefined();
      expect(body.context_envelope.workspace_id).toBe(WS_ID);
    });
  });
});

// 11.T.2 — Chat with function call combat_search
describe("11.T.2 — Function call combat_search", () => {
  let server: ApiServer;

  beforeAll(async () => {
    let callCount = 0;
    const provider = createTestLlmProvider(async (req) => {
      callCount++;
      if (callCount === 1) {
        return {
          text: null,
          function_calls: [{ name: "combat_search", args: { query: "punch" } }],
          finished: false,
        };
      }
      return {
        text: "Found attacks matching your query.",
        function_calls: [],
        finished: true,
      };
    });

    server = new ApiServer({
      port: TEST_PORT + 1,
      llmProvider: provider,
      queryPort: {
        searchAttacks: vi.fn().mockResolvedValue([
          { attack_id: "atk_1", name: "Light Punch", damage: 25, startup_frames: 4, active_frames: 2, recovery_frames: 8 },
        ]),
        getAttack: vi.fn(),
      } as any,
    });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("executes combat_search and returns tool call results", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 1}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Search for punch attacks" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.reply).toContain("Found attacks");
    expect(body.tool_calls).toHaveLength(1);
    expect(body.tool_calls[0].tool_id).toBe("combat_search");
    expect(body.llm_orchestrated).toBe(true);
  });
});

// 11.T.3 — Chat with combat_propose_change creates changeset
describe("11.T.3 — combat_propose_change creates changeset", () => {
  let server: ApiServer;

  beforeAll(async () => {
    let callCount = 0;
    const provider = createTestLlmProvider(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          text: null,
          function_calls: [{
            name: "combat_propose_change",
            args: {
              base_revision: "rev-1",
              target_revision: "rev-2",
              mutations: [{ type: "attack_damage", attack_id: "atk_1", current_damage: 25, proposed_damage: 35, reason: "Buff" }],
            },
          }],
          finished: false,
        };
      }
      return { text: "ChangeSet proposed successfully.", function_calls: [], finished: true };
    });

    server = new ApiServer({ port: TEST_PORT + 2, llmProvider: provider });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates changeset and includes it in response", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 2}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Buff light punch damage to 35" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.proposed_changeset).toBeDefined();
    expect(body.proposed_changeset.workspace_id).toBe(WS_ID);
    expect(body.proposed_changeset.status).toBe("proposed");
    expect(body.proposed_changeset.proposed_by).toBe("combat_director_llm");
    expect(body.proposed_changeset.mutations).toHaveLength(1);
  });
});

// 11.T.4 — MAX_TOOL_CALL_ROUNDS enforcement
describe("11.T.4 — Tool call round limit", () => {
  let server: ApiServer;

  beforeAll(async () => {
    // Provider always returns function calls — should be capped at MAX_TOOL_CALL_ROUNDS
    const provider = createTestLlmProvider(async () => ({
      text: null,
      function_calls: [{ name: "combat_search", args: { query: "infinite" } }],
      finished: false,
    }));

    server = new ApiServer({
      port: TEST_PORT + 3,
      llmProvider: provider,
      queryPort: {
        searchAttacks: vi.fn().mockResolvedValue([]),
        getAttack: vi.fn(),
      } as any,
    });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("stops after MAX_TOOL_CALL_ROUNDS and includes warning", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 3}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Keep searching" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tool_calls.length).toBeLessThanOrEqual(5);
    expect(body.reply).toContain("Tool call limit reached");
  });
});

// 11.T.5 — Fallback to mock when no LlmProvider
describe("11.T.5 — Fallback to deterministic mock", () => {
  let server: ApiServer;

  beforeAll(async () => {
    // No llmProvider — should use the mock path
    server = new ApiServer({ port: TEST_PORT + 4 });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns deterministic mock response for 'buff' keyword", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 4}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Buff the light punch" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.reply).toContain("changeset proposal");
    expect(body.proposed_changeset).toBeDefined();
    expect(body.llm_orchestrated).toBeUndefined(); // Not set in mock path
  });

  it("returns generic response for unknown prompt", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 4}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Hello there" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.reply).toContain("Combat Director active");
  });
});

// 11.T.6 — System prompt contains context from envelope
describe("11.T.6 — System prompt includes envelope context", () => {
  let server: ApiServer;
  let capturedSystemPrompt = "";

  beforeAll(async () => {
    const provider = createTestLlmProvider(async (req) => {
      capturedSystemPrompt = req.system_prompt;
      return { text: "Acknowledged context.", function_calls: [], finished: true };
    });

    server = new ApiServer({ port: TEST_PORT + 5, llmProvider: provider });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("system prompt contains workspace_id and snapshot info", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 5}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({
        prompt: "Show me attacks",
        context: { snapshot_hash: "snap_xyz", selected_attack_ids: ["atk_dragon_punch"] },
      }),
    });
    expect(res.status).toBe(200);

    expect(capturedSystemPrompt).toContain(WS_ID);
    expect(capturedSystemPrompt).toContain("snap_xyz");
    expect(capturedSystemPrompt).toContain("atk_dragon_punch");
    expect(capturedSystemPrompt).toContain("NEVER fabricate Gate verdicts");
    expect(capturedSystemPrompt).toContain("NEVER approve");
  });
});

// 11.T.7 — LlmProvider errors return 503
describe("11.T.7 — LLM provider error handling", () => {
  let server: ApiServer;

  beforeAll(async () => {
    const provider = createTestLlmProvider(async () => {
      throw new Error("Gemini API rate limit exceeded");
    });

    server = new ApiServer({ port: TEST_PORT + 6, llmProvider: provider });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns 503 with error message when LLM provider fails", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT + 6}/api/workspaces/${WS_ID}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Authorized-Workspaces": "*" },
      body: JSON.stringify({ prompt: "Test error handling" }),
    });
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe("LLM_PROVIDER_ERROR");
    expect(body.message).toContain("Gemini API rate limit exceeded");
    expect(body.context_envelope).toBeDefined();
  });
});
