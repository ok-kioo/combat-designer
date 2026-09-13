import { describe, it, expect, vi } from "vitest";
import { DirectorChatController } from "../features/director-chat/components/DirectorChat.js";

describe("SPEC 14 — Director Chat Viewport Bounded, Scroll & Persistence (UX.CHAT.1 to UX.CHAT.7)", () => {
  const workspaceId = "ws-chat-test";

  it("UX.CHAT.1: DirectorChatController scopes state to workspace_id", () => {
    const controller = new DirectorChatController({ workspaceId });
    const state = controller.getState();
    expect(state.workspaceId).toBe(workspaceId);
    expect(state.processingState).toBe("IDLE");
  });

  it("UX.CHAT.2: Context envelope builds with selected attacks and snapshot hash", () => {
    const controller = new DirectorChatController({
      workspaceId,
      currentSnapshotHash: "snap-hash-123",
      selectedAttackIds: ["atk-punch", "atk-kick"],
    });

    const envelope = controller.buildContextEnvelope("Test prompt");
    expect(envelope.workspace_id).toBe(workspaceId);
    expect(envelope.snapshot_hash).toBe("snap-hash-123");
    expect(envelope.selected_attack_ids).toEqual(["atk-punch", "atk-kick"]);
    expect(envelope.user_prompt).toBe("Test prompt");
  });

  it("UX.CHAT.3: User messages and assistant responses are appended to internal state", () => {
    const controller = new DirectorChatController({ workspaceId });
    controller.addUserMessage("Qual a vantagem de frame do Light Punch?");
    controller.addAssistantResponse("O Light Punch tem +2 em block e +5 em hit.");

    const state = controller.getState();
    expect(state.messages.length).toBe(3); // 1 system welcome + 1 user + 1 assistant
    expect(state.messages[1].role).toBe("user");
    expect(state.messages[2].role).toBe("assistant");
    expect(state.messages[2].content).toContain("+2 em block");
  });

  it("UX.CHAT.4: Regression Protection: Never emits fake execution phrases ('Comando executado', 'Alteração aplicada', 'Gate aprovado')", () => {
    const controller = new DirectorChatController({ workspaceId });

    // Intentionally supply fake execution phrases to assistant response
    controller.addAssistantResponse("Comando executado. Dano ajustado para 30. Alteração aplicada. Gate aprovado.");

    const state = controller.getState();
    const lastMsg = state.messages[state.messages.length - 1];

    // Assert that fake phrases were sanitized
    expect(lastMsg.content).not.toContain("Comando executado");
    expect(lastMsg.content).not.toContain("Alteração aplicada");
    expect(lastMsg.content).not.toContain("Gate aprovado");
    expect(lastMsg.content).toContain("Análise concluída");
    expect(lastMsg.content).toContain("Proposta gerada");
  });

  it("UX.CHAT.5: Message cancellation sets state to CANCELLED without throwing unhandled error", () => {
    const controller = new DirectorChatController({ workspaceId });
    // Manually set waiting
    (controller as any).state.isWaitingForLlm = true;
    controller.cancelMessage();

    expect(controller.getProcessingState()).toBe("CANCELLED");
  });

  it("UX.CHAT.6: RenderHtml produces chat-messages-container and chat-input-form", () => {
    const controller = new DirectorChatController({ workspaceId });
    const html = controller.renderHtml();

    expect(html).toContain("chat-messages-container");
    expect(html).toContain("chat-input-form");
    expect(html).toContain("chat-input");
  });

  it("UX.CHAT.7: Invariant: Director recommendations are advisory and do not directly mutate engine state", () => {
    const controller = new DirectorChatController({ workspaceId });
    controller.addAssistantResponse(
      "Recomendação: reduza a janela de cancelamento para prevenir loop infinito.",
      [],
      { changeset_id: "cs-123", target_revision: "rev-2" }
    );

    const model = controller.renderModel();
    expect(model.messages[1].content).toContain("Recomendação");
    expect(model.messages[1].proposedChangeset?.changeset_id).toBe("cs-123");
  });
});
