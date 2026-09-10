import { describe, it, expect, vi } from "vitest";
import { ChangeSetReviewController } from "../features/changeset-review/components/ChangeSetReview.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — ChangeSet Review UI (10.UI.6 - 10.UI.7)", () => {
  const workspaceId = "ws-review-alpha";

  it("10.UI.6: ChangeSetReview parses and renders mutation diffs correctly", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.getChangeSets = vi.fn().mockResolvedValue({
      count: 1,
      changesets: [
        {
          changeset_id: "cs_buff_1",
          workspace_id: workspaceId,
          base_revision: "rev-1",
          target_revision: "rev-2",
          proposed_by: "director_llm",
          status: "proposed",
          mutations: [
            {
              type: "attack_damage",
              attack_id: "atk_light_punch",
              current_damage: 25,
              proposed_damage: 40,
              reason: "Boost early frame utility",
            },
          ],
          created_at: new Date().toISOString(),
        },
      ],
    });

    const review = new ChangeSetReviewController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const loaded = await review.loadChangeSets();
    expect(loaded.length).toBe(1);

    const model = review.renderModel();
    expect(model.selectedChangesetId).toBe("cs_buff_1");
    expect(model.selectedChangeset?.diffs.length).toBe(1);
    expect(model.selectedChangeset?.diffs[0].field).toBe("damage");
    expect(model.selectedChangeset?.diffs[0].current_value).toBe(25);
    expect(model.selectedChangeset?.diffs[0].proposed_value).toBe(40);

    const html = review.renderHtml();
    expect(html).toContain("atk_light_punch");
    expect(html).toContain("25");
    expect(html).toContain("40");
    expect(html).toContain("Boost early frame utility");
  });

  it("10.UI.7: ChangeSetReview executes approval, application with Gate PASS, and withdrawal", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.approveChangeSet = vi.fn().mockResolvedValue({
      changeset: {
        changeset_id: "cs_1",
        workspace_id: workspaceId,
        status: "approved",
        target_revision: "rev-2",
        mutations: [],
        created_at: new Date().toISOString(),
      },
    });

    mockApiClient.applyChangeSet = vi.fn().mockResolvedValue({
      changeset: {
        changeset_id: "cs_1",
        workspace_id: workspaceId,
        status: "applied",
        target_revision: "rev-2",
        mutations: [],
        created_at: new Date().toISOString(),
      },
    });

    mockApiClient.withdrawChangeSet = vi.fn().mockResolvedValue({
      changeset: {
        changeset_id: "cs_1",
        workspace_id: workspaceId,
        status: "withdrawn",
        target_revision: "rev-2",
        mutations: [],
        created_at: new Date().toISOString(),
      },
    });

    const review = new ChangeSetReviewController({
      workspaceId,
      apiClient: mockApiClient,
      initialChangesets: [
        {
          changeset_id: "cs_1",
          workspace_id: workspaceId,
          status: "proposed",
          target_revision: "rev-2",
          mutations: [],
          created_at: new Date().toISOString(),
        },
      ],
    });

    // Approve
    const approved = await review.approveChangeset("cs_1", "lead_designer");
    expect(approved.status).toBe("approved");
    expect(mockApiClient.approveChangeSet).toHaveBeenCalledWith(workspaceId, "cs_1", "lead_designer");

    // Apply with Gate PASS
    const applied = await review.applyChangeset("cs_1", { verdict: "PASS" });
    expect(applied.status).toBe("applied");
    expect(mockApiClient.applyChangeSet).toHaveBeenCalledWith(workspaceId, "cs_1", { verdict: "PASS" });

    // Withdraw
    const withdrawn = await review.withdrawChangeset("cs_1", "Testing withdrawal");
    expect(withdrawn.status).toBe("withdrawn");
  });
});
