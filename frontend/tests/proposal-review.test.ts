import { describe, it, expect, vi } from "vitest";
import { ProposalReviewController } from "../features/proposal-review/components/ProposalReview.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 — Suggested Adjustment & Proposal Review UI (10.UI.6 - 10.UI.7)", () => {
  const workspaceId = "ws-review-alpha";

  it("10.UI.6: ProposalReview parses and renders mutation diffs correctly", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.getProposals = vi.fn().mockResolvedValue({
      count: 1,
      proposals: [
        {
          id: "prop_buff_1",
          proposal_id: "prop_buff_1",
          workspace_id: workspaceId,
          base_revision: "rev-1",
          target_revision: "rev-2",
          proposed_by: "director_llm",
          status: "ACTIVE",
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

    const review = new ProposalReviewController({
      workspaceId,
      apiClient: mockApiClient,
    });

    const loaded = await review.loadProposals();
    expect(loaded.length).toBe(1);

    const model = review.renderModel();
    expect(model.selectedProposalId).toBe("prop_buff_1");
    expect(model.selectedProposal?.diffs.length).toBe(1);
    expect(model.selectedProposal?.diffs[0].field).toBe("damage");
    expect(model.selectedProposal?.diffs[0].current_value).toBe(25);
    expect(model.selectedProposal?.diffs[0].proposed_value).toBe(40);

    const html = review.renderHtml();
    expect(html).toContain("atk_light_punch");
    expect(html).toContain("25");
    expect(html).toContain("40");
    expect(html).toContain("Boost early frame utility");
  });

  it("10.UI.7: ProposalReview inspects proposal and executes withdrawal", async () => {
    const mockApiClient = new ApiClient();
    mockApiClient.withdrawProposal = vi.fn().mockResolvedValue({
      proposal: {
        id: "prop_1",
        proposal_id: "prop_1",
        workspace_id: workspaceId,
        status: "WITHDRAWN",
        target_revision: "rev-2",
        mutations: [],
        created_at: new Date().toISOString(),
      },
    });

    const review = new ProposalReviewController({
      workspaceId,
      apiClient: mockApiClient,
      initialProposals: [
        {
          id: "prop_1",
          proposal_id: "prop_1",
          workspace_id: workspaceId,
          status: "ACTIVE",
          target_revision: "rev-2",
          mutations: [],
          created_at: new Date().toISOString(),
        },
      ],
    });

    review.selectProposal("prop_1");
    expect(review.getSelectedProposal()?.status).toBe("ACTIVE");

    // Withdraw
    const withdrawn = await review.withdrawProposal("prop_1", "Testing withdrawal");
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(mockApiClient.withdrawProposal).toHaveBeenCalledWith(workspaceId, "prop_1", "Testing withdrawal");
  });
});
