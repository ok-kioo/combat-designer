import { describe, it, expect, vi } from "vitest";
import { AttackCatalogController } from "../features/catalog/components/AttackCatalog.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — Attack Catalog UI & Selection (10.UI.1 - 10.UI.3)", () => {
  const workspaceId = "ws-catalog-alpha";

  it("10.UI.1: AttackCatalog loads attacks from backend and computes frame data and durations", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.getAttacks = vi.fn().mockResolvedValue({
      count: 2,
      attacks: [
        {
          attack_id: "atk_jab",
          name: "Quick Jab",
          startup_frames: 4,
          active_frames: 2,
          recovery_frames: 6,
          damage: 15,
          cancel_window: { start_frame: 6, end_frame: 9 },
          tags: ["light", "punch"],
          untrusted_text: true,
        },
        {
          attack_id: "atk_sweep",
          name: "Low Sweep",
          startup_frames: 12,
          active_frames: 4,
          recovery_frames: 16,
          damage: 60,
          tags: ["heavy", "kick"],
          untrusted_text: true,
        },
      ],
    });

    const catalog = new AttackCatalogController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const attacks = await catalog.loadAttacks();
    expect(attacks.length).toBe(2);
    expect(mockApiClient.getAttacks).toHaveBeenCalledWith(workspaceId, {
      query: undefined,
      tag: undefined,
      min_cancel_window: undefined,
    });

    const model = catalog.renderModel();
    expect(model.totalCount).toBe(2);
    expect(model.attacks[0].total_duration).toBe(12); // 4 + 2 + 6
    expect(model.attacks[1].total_duration).toBe(32); // 12 + 4 + 16
    expect(model.attacks[0].untrusted_text).toBe(true);

    const html = catalog.renderHtml();
    expect(html).toContain("Quick Jab");
    expect(html).toContain("untrusted");
  });

  it("10.UI.2: AttackCatalog supports search and cancel window filtering", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.getAttacks = vi.fn().mockResolvedValue({
      count: 1,
      attacks: [
        {
          attack_id: "atk_jab",
          name: "Quick Jab",
          startup_frames: 4,
          active_frames: 2,
          recovery_frames: 6,
          damage: 15,
          cancel_window: { start_frame: 6, end_frame: 9 },
          tags: ["light"],
        },
      ],
    });

    const catalog = new AttackCatalogController({
      workspaceId,
      apiClient: mockApiClient,
    });

    await catalog.loadAttacks({ query: "jab", minCancelWindow: 3 });
    expect(mockApiClient.getAttacks).toHaveBeenCalledWith(workspaceId, {
      query: "jab",
      tag: undefined,
      min_cancel_window: 3,
    });
    expect(catalog.getState().filter.query).toBe("jab");
    expect(catalog.getState().filter.minCancelWindow).toBe(3);
  });

  it("10.UI.3: Attack selection triggers onSelectionChange to populate LLM context", async () => {
    let selectedQueued: string[] = [];
    const catalog = new AttackCatalogController({
      workspaceId,
      initialAttacks: [
        {
          attack_id: "atk_1",
          name: "Slash",
          startup_frames: 6,
          active_frames: 3,
          recovery_frames: 10,
          damage: 40,
        },
        {
          attack_id: "atk_2",
          name: "Thrust",
          startup_frames: 8,
          active_frames: 2,
          recovery_frames: 12,
          damage: 55,
        },
      ],
      onSelectionChange: (ids) => {
        selectedQueued = ids;
      },
    });

    catalog.toggleSelectAttack("atk_1");
    expect(selectedQueued).toEqual(["atk_1"]);
    expect(catalog.getSelectedAttacks().map((a) => a.attack_id)).toEqual(["atk_1"]);

    catalog.toggleSelectAttack("atk_2");
    expect(selectedQueued).toEqual(["atk_1", "atk_2"]);

    catalog.toggleSelectAttack("atk_1"); // deselect atk_1
    expect(selectedQueued).toEqual(["atk_2"]);

    catalog.clearSelection();
    expect(selectedQueued).toEqual([]);
  });
});
