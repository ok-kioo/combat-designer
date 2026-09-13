import { describe, it, expect, beforeEach } from "vitest";
import { createTestEnvironment } from "./test-helper.js";

describe("SPEC 06 — Authority & Architectural Invariants (Section 33)", () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  it("Invariant: LLM cannot manufacture AnalysisResult or SimulationResult", async () => {
    // Calling analyze routes strictly through CombatAnalysisPort
    const res = await env.gateway.execute(env.llmDirector, "combat_analyze", {
      workspace_id: "ws-alpha",
      subject: "Frame Advantage Analysis",
    });

    const data = res.data as any;
    expect(data.source).toBe("combat_analysis");
    expect(data.analysis_id).toBeDefined();
    expect(data.status).toBe("COMPLETED");
  });

  it("Invariant: ChangeSets are strictly consultative proposals and cannot directly persist to canonical state", async () => {
    const proposal = await env.adapter.proposeChangeset(
      "ws-alpha",
      "rev-1",
      "rev-2",
      env.llmDirector.principal_id,
      [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 30,
          reason: "Buff",
        },
      ]
    );

    expect(proposal.status).toBe("proposed");
    expect((proposal as any).applied_at).toBeUndefined();

    // Direct mutation tools do not exist in gateway
    await expect(
      env.gateway.execute(env.llmDirector, "apply_mutation" as any, {
        workspace_id: "ws-alpha",
        changeset_id: proposal.changeset_id,
      })
    ).rejects.toThrow();
  });

  it("Invariant: Proposed changesets can only transition to withdrawn", async () => {
    const proposal = await env.adapter.proposeChangeset(
      "ws-alpha",
      "rev-1",
      "rev-2",
      env.humanLead.principal_id,
      [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 30,
          reason: "Buff",
        },
      ]
    );

    expect(proposal.status).toBe("proposed");

    const withdrawn = await env.adapter.withdrawChangeset(
      "ws-alpha",
      proposal.changeset_id,
      "Superseded by alternate design"
    );

    expect(withdrawn.status).toBe("withdrawn");
  });

  it("Invariant: Workspace isolation prevents cross-workspace tool execution", async () => {
    // Attempting operation in ws-beta with principal authorized only for ws-alpha
    await expect(
      env.gateway.execute(env.llmDirector, "combat_search", {
        workspace_id: "ws-beta",
        query: "punch",
      })
    ).rejects.toThrow(/not authorized.*workspace 'ws-beta'/);

    await expect(
      env.gateway.execute(env.llmDirector, "combat_analyze", {
        workspace_id: "ws-beta",
        subject: "Cross workspace analysis",
      })
    ).rejects.toThrow(/not authorized.*workspace 'ws-beta'/);
  });
});
