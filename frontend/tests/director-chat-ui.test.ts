import { describe, it, expect, vi } from "vitest";
import { DirectorChatController } from "../features/director-chat/components/DirectorChat.js";
import { MarkdownRenderer, StreamingMarkdownBuffer } from "../features/director-chat/services/markdown-renderer.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 13 — Director Chat UI Suite (13.UI.1 – 13.UI.13)", () => {
  const workspaceId = "ws-combat-ui-test";

  // 13.UI.1 — Processing indicator
  it("13.UI.1: Displays processing indicator during request lifecycle", async () => {
    const mockApiClient = new ApiClient();
    let resolveMessage: any;
    mockApiClient.sendChatMessage = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveMessage = resolve;
      });
    });

    const chat = new DirectorChatController({ workspaceId, apiClient: mockApiClient });
    expect(chat.getProcessingState()).toBe("IDLE");

    const sendPromise = chat.sendMessage("Analyze light punch");
    expect(["SUBMITTING", "ANALYZING", "FORMULATING"]).toContain(chat.getProcessingState());
    expect(chat.getState().isWaitingForLlm).toBe(true);

    const htmlDuring = chat.renderHtml();
    expect(htmlDuring).toContain("chat-processing-indicator");

    resolveMessage({
      workspace_id: workspaceId,
      reply: "Light punch has 4 frames startup.",
      activities: [{ activity_id: "act-1", status: "completed", label: "Consultando frame data..." }],
      context_envelope: chat.buildContextEnvelope("Analyze light punch"),
    });

    await sendPromise;
    expect(chat.getProcessingState()).toBe("COMPLETED");
    expect(chat.getState().isWaitingForLlm).toBe(false);
  });

  // 13.UI.2 — Activity rendering
  it("13.UI.2: Renders public tool activity indicators with friendly labels", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.sendChatMessage = vi.fn().mockResolvedValue({
      workspace_id: workspaceId,
      reply: "Analysis ready.",
      activities: [
        { activity_id: "act-1", status: "completed", label: "Consultando frame data..." },
        { activity_id: "act-2", status: "completed", label: "Simulando cenário..." },
      ],
      context_envelope: { workspace_id: workspaceId },
    });

    const chat = new DirectorChatController({ workspaceId, apiClient: mockApiClient });
    await chat.sendMessage("Test activities");

    const html = chat.renderHtml();
    expect(html).toContain("activity-indicator");
    expect(html).toContain("Consultando frame data...");
    expect(html).toContain("Simulando cenário...");
    // Must NOT contain internal tool internals
    expect(html).not.toContain("combat_simulate(");
    expect(html).not.toContain("trace_id=");
  });

  // 13.UI.3 — Markdown headings
  it("13.UI.3: Correctly parses and renders Markdown headings", () => {
    const renderer = new MarkdownRenderer();
    const markdown = "# Heading 1\n## Heading 2\n### Heading 3";
    const html = renderer.render(markdown);

    expect(html).toContain("<h1>Heading 1</h1>");
    expect(html).toContain("<h2>Heading 2</h2>");
    expect(html).toContain("<h3>Heading 3</h3>");
  });

  // 13.UI.4 — Markdown bold and italic
  it("13.UI.4: Correctly parses bold and italic markdown elements", () => {
    const renderer = new MarkdownRenderer();
    const markdown = "O golpe **Heavy Punch** causa *dano crítico*.";
    const html = renderer.render(markdown);

    expect(html).toContain("<strong>Heavy Punch</strong>");
    expect(html).toContain("<em>dano crítico</em>");
  });

  // 13.UI.5 — Lists
  it("13.UI.5: Correctly renders ordered and unordered lists", () => {
    const renderer = new MarkdownRenderer();
    const unordered = "- 4 frames startup\n- 2 frames active\n- 8 frames recovery";
    const unorderedHtml = renderer.render(unordered);
    expect(unorderedHtml).toContain("<ul>");
    expect(unorderedHtml).toContain("<li>4 frames startup</li>");

    const ordered = "1. Light Punch\n2. Medium Kick\n3. Heavy Finisher";
    const orderedHtml = renderer.render(ordered);
    expect(orderedHtml).toContain("<ol>");
    expect(orderedHtml).toContain("<li>Light Punch</li>");
  });

  // 13.UI.6 — Code blocks
  it("13.UI.6: Correctly renders fenced code blocks and inline code", () => {
    const renderer = new MarkdownRenderer();
    const markdown = "Use `atk_heavy_punch` in config:\n```json\n{\n  \"damage\": 85\n}\n```";
    const html = renderer.render(markdown);

    expect(html).toContain("<code>atk_heavy_punch</code>");
    expect(html).toMatch(/<pre[^>]*><code class="language-json">/);
    expect(html).toContain('&quot;damage&quot;: 85');
  });

  // 13.UI.7 — Tables
  it("13.UI.7: Correctly renders Markdown tables", () => {
    const renderer = new MarkdownRenderer();
    const markdown = `
| Ataque | Startup | Dano |
|---|---|---|
| Light Punch | 4f | 25 |
| Heavy Kick | 12f | 90 |
`;
    const html = renderer.render(markdown);

    expect(html).toContain("<table>");
    expect(html).toContain("<th>Ataque</th>");
    expect(html).toContain("<th>Startup</th>");
    expect(html).toContain("<td>Light Punch</td>");
    expect(html).toContain("<td>90</td>");
  });

  // 13.UI.8 — Streaming Markdown buffering
  it("13.UI.8: Buffers incomplete markdown blocks during streaming without visual corruption", () => {
    const buffer = new StreamingMarkdownBuffer();
    buffer.appendChunk("## Análise em progresso\n\n```json\n{\n  \"startup\": 4");

    // Unclosed code block should be previewable without crashing or corrupting DOM
    const preview = buffer.getRendered();
    expect(preview).toContain("<h2>Análise em progresso</h2>");
    expect(preview).toMatch(/<pre[^>]*><code/);
    expect(preview).toContain('&quot;startup&quot;: 4');

    // Complete the block
    buffer.appendChunk("\n}\n```");
    const complete = buffer.complete();
    expect(complete).toMatch(/<pre[^>]*><code class="language-json">/);
  });

  // 13.UI.9 — XSS sanitization
  it("13.UI.9: Strips executable script tags, iframes, and event handlers", () => {
    const renderer = new MarkdownRenderer();
    const malicious = `
# Ataque Seguro
<script>alert("XSS")</script>
<img src="x" onerror="alert(1)" />
<iframe src="https://evil.com"></iframe>
<button onclick="stealTokens()">Click me</button>
`;
    const html = renderer.render(malicious);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<button");
  });

  // 13.UI.10 — Dangerous URL protocols
  it("13.UI.10: Rejects links using javascript:, vbscript:, or data: protocols", () => {
    const renderer = new MarkdownRenderer();
    const markdown = `
[Exploit](javascript:alert(document.cookie))
[Visualizar Veredito](https://combatdesigner.io/verdicts)
[Malicious Data](data:text/html,<script>evil()</script>)
`;
    const html = renderer.render(markdown);

    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).toContain('href="https://combatdesigner.io/verdicts"');
  });

  // 13.UI.11 — Cancellation
  it("13.UI.11: Supports explicit cancellation of pending chat response", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.sendChatMessage = vi.fn().mockImplementation(() => {
      return new Promise((_resolve, reject) => {
        setTimeout(() => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        }, 50);
      });
    });

    const chat = new DirectorChatController({ workspaceId, apiClient: mockApiClient });
    const messagePromise = chat.sendMessage("Long simulation request");

    expect(chat.getState().isWaitingForLlm).toBe(true);
    chat.cancelMessage();

    expect(chat.getProcessingState()).toBe("CANCELLED");
    expect(chat.getState().isWaitingForLlm).toBe(false);

    const res = await messagePromise;
    expect(res.processing_state).toBe("CANCELLED");
  });

  // 13.UI.12 — Friendly error rendering
  it("13.UI.12: Renders controlled, friendly error messages when backend fails", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.sendChatMessage = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.4:5432"));

    const chat = new DirectorChatController({ workspaceId, apiClient: mockApiClient });

    await expect(chat.sendMessage("Check stats")).rejects.toThrow();
    expect(chat.getProcessingState()).toBe("ERROR");

    const html = chat.renderHtml();
    expect(html).toContain("Não foi possível concluir a análise");
    expect(html).not.toContain("10.0.0.4:5432");
  });

  // 13.UI.13 — No fake "Comando executado"
  it("13.UI.13: Strictly prohibits false execution messages like 'Comando executado.'", () => {
    const chat = new DirectorChatController({ workspaceId });
    chat.addAssistantResponse("Comando executado. Alteração aplicada com sucesso.");

    const model = chat.renderModel();
    const lastMessage = model.messages[model.messages.length - 1];

    expect(lastMessage.content).not.toContain("Comando executado.");
    expect(lastMessage.content).not.toContain("Alteração aplicada.");
    expect(lastMessage.content).toContain("Análise concluída.");
  });
});
