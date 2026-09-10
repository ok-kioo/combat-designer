import { describe, it, expect, vi } from "vitest";
import { CombatExplorerController } from "../features/combat-explorer/components/CombatExplorer.js";
import { ProjectPanelController } from "../features/project-workspace/components/ProjectPanel.js";
import { DirectorChatController } from "../features/director-chat/components/DirectorChat.js";
import { createCombatExplorerPage } from "../app/page.js";

describe("SPEC 08 — Frontend Combat Explorer UI", () => {
  const workspaceId = "ws-combat-alpha";

  it("08.UI.1: Renders two-column layout with left ProjectPanel and right DirectorChat", () => {
    const explorer = new CombatExplorerController({ workspaceId });
    const model = explorer.renderLayout();

    expect(model.layout).toBe("two-column");
    expect(model.workspaceId).toBe(workspaceId);
    expect(model.leftColumn.name).toBe("ProjectPanel");
    expect(model.leftColumn.data.column).toBe("left");
    expect(model.rightColumn.name).toBe("DirectorChat");
    expect(model.rightColumn.data.column).toBe("right");
  });

  it("08.UI.2: Both columns are strictly scoped to the active workspace_id", () => {
    const explorer = new CombatExplorerController({ workspaceId });
    const model = explorer.renderLayout();

    expect(model.leftColumn.data.workspaceId).toBe(workspaceId);
    expect(model.rightColumn.data.workspaceId).toBe(workspaceId);
  });

  it("08.UI.3: ProjectPanel correctly tracks ingestion status, snapshot hash, and history", () => {
    const panel = new ProjectPanelController({
      workspaceId,
      initialState: {
        projectId: "core-combat",
        revisionLabel: "rev-042",
        snapshotHash: "hash-abc123",
        ingestionStatus: {
          processed: 12,
          quarantined: 1,
          conflicts: 0,
        },
      },
    });

    panel.addHistoryEntry({
      type: "gate_run",
      id: "gate-run-001",
      verdict: "PASS",
      timestamp: "2026-09-09T18:00:00Z",
    });

    const model = panel.renderModel();
    expect(model.projectId).toBe("core-combat");
    expect(model.revision).toBe("rev-042");
    expect(model.snapshotHash).toBe("hash-abc123");
    expect(model.ingestion.processedCount).toBe(12);
    expect(model.ingestion.quarantinedCount).toBe(1);
    expect(model.ingestion.conflictsCount).toBe(0);
    expect(model.historyCount).toBe(1);
    expect(model.history[0].verdict).toBe("PASS");
  });

  it("08.UI.4: ProjectPanel uploads bundle through backend HTTP boundary, not direct state mutation", async () => {
    const panel = new ProjectPanelController({ workspaceId });

    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "SUCCESS",
        snapshot_hash: "snap-hash-999",
        revision: "rev-upload-1",
        project_id: "uploaded-proj",
        summary: {
          processed: 5,
          quarantined: 0,
          conflicts: 0,
        },
      }),
    });
    global.fetch = mockFetch;

    const result = await panel.uploadBundle({
      manifest: { workspace_id: workspaceId },
      files: { "assets/atk.asset": "content" },
    });

    expect(result.success).toBe(true);
    expect(result.snapshotHash).toBe("snap-hash-999");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/workspaces/${workspaceId}/bundles`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-authorized-workspaces": workspaceId,
        }),
      })
    );

    const state = panel.getState();
    expect(state.snapshotHash).toBe("snap-hash-999");
    expect(state.revisionLabel).toBe("rev-upload-1");
  });

  it("08.UI.5: DirectorChat manages messages and tool call representations", () => {
    const chat = new DirectorChatController({ workspaceId });
    chat.addUserMessage("Verify heavy punch startup frames");

    chat.addAssistantResponse("Heavy punch has 8 startup frames and passes safety gate.", [
      {
        toolName: "combat_verify",
        arguments: { attack_id: "heavy_punch" },
        verdict: "PASS",
      },
    ]);

    const model = chat.renderModel();
    expect(model.messageCount).toBe(3); // system welcome + user + assistant
    expect(model.messages[1].content).toBe("Verify heavy punch startup frames");
    expect(model.messages[2].toolCalls?.[0].verdict).toBe("PASS");
  });

  it("08.UI.6: createCombatExplorerPage initializes root layout with active workspace", () => {
    const page = createCombatExplorerPage("ws-production");
    expect(page.workspaceId).toBe("ws-production");
    expect(page.leftColumn.data.workspaceId).toBe("ws-production");
    expect(page.rightColumn.data.workspaceId).toBe("ws-production");
  });
});
