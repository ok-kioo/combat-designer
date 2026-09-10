import { describe, it, expect, vi } from "vitest";
import { DirectorChatController } from "../features/director-chat/components/DirectorChat.js";
import { CombatExplorerController } from "../features/combat-explorer/components/CombatExplorer.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — Director Chat & Structured LLM Input (10.UI.8)", () => {
  const workspaceId = "ws-director-alpha";

  it("10.UI.8: DirectorChat assembles LlmPromptContextEnvelope and renders tool execution and proposal cards", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.sendChatMessage = vi.fn().mockResolvedValue({
      workspace_id: workspaceId,
      reply: "I propose increasing Light Punch damage from 25 to 35.",
      tool_calls: [
        {
          tool_id: "combat_propose_change",
          input: { workspace_id: workspaceId, mutations: [] },
          output: { status: "PROPOSED", changeset_id: "cs_123" },
          untrusted_text: true,
        },
      ],
      proposed_changeset: {
        changeset_id: "cs_123",
        target_revision: "rev-2",
        mutations: [
          {
            type: "attack_damage",
            attack_id: "atk_light_punch",
            proposed_damage: 35,
            reason: "User tuning",
          },
        ],
      },
      context_envelope: {
        workspace_id: workspaceId,
        snapshot_hash: "snap_hash_999",
        selected_attack_ids: ["atk_light_punch"],
        user_prompt: "Buff light punch",
        timestamp: new Date().toISOString(),
      },
    });

    const chat = new DirectorChatController({
      workspaceId,
      apiClient: mockApiClient,
      currentSnapshotHash: "snap_hash_999",
      selectedAttackIds: ["atk_light_punch"],
    });

    // Verify context envelope construction
    const envelope = chat.buildContextEnvelope("Buff light punch");
    expect(envelope.workspace_id).toBe(workspaceId);
    expect(envelope.snapshot_hash).toBe("snap_hash_999");
    expect(envelope.selected_attack_ids).toEqual(["atk_light_punch"]);
    expect(envelope.user_prompt).toBe("Buff light punch");

    // Send message
    const res = await chat.sendMessage("Buff light punch");
    expect(res.reply).toContain("Light Punch damage");
    expect(mockApiClient.sendChatMessage).toHaveBeenCalledWith(workspaceId, "Buff light punch", {
      snapshot_hash: "snap_hash_999",
      selected_attack_ids: ["atk_light_punch"],
      active_changeset_id: undefined,
    });

    const model = chat.renderModel();
    expect(model.messages.length).toBe(3); // system welcome + user + assistant
    const lastMsg = model.messages[2];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.toolCalls?.length).toBe(1);
    expect(lastMsg.toolCalls?.[0].untrusted_text).toBe(true);
    expect(lastMsg.proposedChangeset?.changeset_id).toBe("cs_123");

    const html = chat.renderHtml();
    expect(html).toContain("combat_propose_change");
    expect(html).toContain("untrusted_text");
    expect(html).toContain("cs_123");
    expect(html).toContain("Review Diff →");
  });

  it("10.UI.8 (Coordinated State): CombatExplorer automatically propagates catalog selection into DirectorChat context", () => {
    const explorer = new CombatExplorerController({
      workspaceId,
      catalogProps: {
        initialAttacks: [
          {
            attack_id: "atk_spin_kick",
            name: "Spin Kick",
            startup_frames: 10,
            active_frames: 4,
            recovery_frames: 14,
            damage: 70,
          },
        ],
      },
    });

    // Initially no attacks selected in chat context
    expect(explorer.directorChat.getState().selectedAttackIds).toEqual([]);

    // Select attack in catalog
    explorer.catalog.toggleSelectAttack("atk_spin_kick");

    // DirectorChat context should automatically receive the selected attack ID
    expect(explorer.directorChat.getState().selectedAttackIds).toEqual(["atk_spin_kick"]);

    const envelope = explorer.directorChat.buildContextEnvelope("Simulate this attack");
    expect(envelope.selected_attack_ids).toEqual(["atk_spin_kick"]);

    // Test tab switching
    expect(explorer.activeTab).toBe("explorer");
    explorer.switchTab("catalog");
    expect(explorer.activeTab).toBe("catalog");
    const layout = explorer.renderLayout();
    expect(layout.activeTab).toBe("catalog");
    expect(layout.leftColumn.name).toBe("catalog");
  });
});
