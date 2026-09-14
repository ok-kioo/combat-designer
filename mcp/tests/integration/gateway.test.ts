import { describe, it, expect, beforeEach } from "vitest";
import { createTestEnvironment } from "./test-helper.js";

describe("SPEC 06 — Gateway & Server Functional Tests (06.T.1 - 06.T.12)", () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  it("06.T.1: authorized read succeeds and returns FACT with untrusted_text markers", async () => {
    const result = await env.gateway.execute(env.llmDirector, "combat_search", {
      workspace_id: "ws-alpha",
      query: "punch",
    });

    expect(result.classification).toBe("FACT");
    const data = result.data as any;
    expect(data.count).toBe(1);
    expect(data.attacks[0].attack_id).toBe("atk_light_punch");
    expect(data.attacks[0].untrusted_text).toBe(true);
  });

  it("06.T.2: authorized simulation succeeds and returns SIMULATION_RESULT", async () => {
    const result = await env.gateway.execute(env.llmDirector, "combat_simulate", {
      workspace_id: "ws-alpha",
      project_id: "proj-1",
      scenario: {
        scenario_id: "sc_1",
        actors: [{ actor_id: "hero", team: 1, initial_health: 100, attack_ids: ["atk_light_punch"] }],
      },
      config: {
        budget: {
          max_frames: 120,
          max_events: 500,
          max_transitions: 500,
        },
      },
    });

    expect(result.classification).toBe("SIMULATION_RESULT");
    const data = result.data as any;
    expect(data.simulation.total_frames).toBe(120);
    expect(data.simulation.final_state_hash).toBeDefined();
  });

  it("06.T.3: authorized analysis succeeds and returns authoritative analysis result", async () => {
    const result = await env.gateway.execute(env.llmDirector, "combat_analyze", {
      workspace_id: "ws-alpha",
      subject: "Attack Frame Data Analysis",
    });

    expect(result.classification).toBe("SIMULATION_RESULT");
    const data = result.data as any;
    expect(data.source).toBe("combat_analysis");
    expect(data.analysis_id).toBeDefined();
    expect(data.status).toBe("COMPLETED");
  });

  it("06.T.4: unauthorized operation is strictly denied (deny-by-default)", async () => {
    // Principal without permission trying to call combat_analyze
    const noPermPrincipal = {
      ...env.llmDirector,
      capabilities: ["combat:read" as const],
    };
    await expect(
      env.gateway.execute(noPermPrincipal, "combat_analyze", {
        workspace_id: "ws-alpha",
        subject: "Forbidden Analysis",
      })
    ).rejects.toThrow();

    // Unknown tool
    await expect(
      env.gateway.execute(env.humanLead, "arbitrary_nonexistent_tool" as any, {
        workspace_id: "ws-alpha",
      })
    ).rejects.toThrow(/Unknown or unregistered tool/);
  });

  it("06.T.5: missing workspace is strictly denied (WORKSPACE_REQUIRED)", async () => {
    await expect(
      env.gateway.execute(env.llmDirector, "combat_search", {
        query: "punch",
      })
    ).rejects.toThrow(/workspace_id is strictly required/);
  });

  it("06.T.6: workspace mismatch is strictly denied (WORKSPACE_MISMATCH)", async () => {
    await expect(
      env.gateway.execute(
        env.humanLead,
        "combat_search",
        {
          workspace_id: "ws-alpha",
          query: "punch",
        },
        { requested_workspace_id: "ws-beta" }
      )
    ).rejects.toThrow(/Context workspace 'ws-beta' does not match payload workspace 'ws-alpha'/);
  });

  it("06.T.7: invalid tool schema is strictly denied (INVALID_TOOL_ARGUMENTS)", async () => {
    await expect(
      env.gateway.execute(env.llmDirector, "combat_search", {
        workspace_id: "ws-alpha",
        min_cancel_window: -5, // Invalid negative value
      })
    ).rejects.toThrow(/Tool arguments validation failed/);
  });

  it("06.T.8: resource isolation strictly prevents cross-workspace reading", async () => {
    // Authorized workspace read
    const resource = await env.server.resourceProvider.readResource(
      "combat://workspace/ws-alpha/attacks/atk_light_punch",
      env.humanLead
    );
    expect(resource.classification).toBe("FACT");

    // Cross-workspace read by principal authorized only for ws-beta
    await expect(
      env.server.resourceProvider.readResource(
        "combat://workspace/ws-alpha/attacks/atk_light_punch",
        env.unauthorizedPrincipal
      )
    ).rejects.toThrow(/not authorized to read resources in workspace 'ws-alpha'/);
  });

  it("06.T.9: proposal creation does NOT apply or mutate canonical model", async () => {
    const result = await env.gateway.execute(env.llmDirector, "combat_create_proposal", {
      workspace_id: "ws-alpha",
      base_revision: "rev-1",
      target_revision: "rev-2",
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 30,
          reason: "Buff damage",
        },
      ],
    });

    const data = result.data as any;
    expect(data.proposal.status).toBe("ACTIVE");
    expect(data.proposal.applied_at).toBeUndefined();

    // Verify stored proposal in repository is strictly in 'proposed' state
    const stored = await env.proposalRepo.getById("ws-alpha", data.proposal.proposal_id);
    expect(stored?.status).toBe("ACTIVE");
    expect(stored?.applied_at).toBeUndefined();
  });

  it("06.T.10: direct mutations are rejected as unregistered tools", async () => {
    await expect(
      env.gateway.execute(env.humanLead, "apply_mutation" as any, {
        workspace_id: "ws-alpha",
        proposal_id: "cs-123",
      })
    ).rejects.toThrow(/Unknown or unregistered tool/);
  });

  it("06.T.11: consultative proposals remain proposed until withdrawn", async () => {
    const proposeRes = await env.gateway.execute(env.llmDirector, "combat_create_proposal", {
      workspace_id: "ws-alpha",
      base_revision: "rev-1",
      target_revision: "rev-2",
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 30,
          reason: "Buff damage",
        },
      ],
    });
    const proposalId = (proposeRes.data as any).proposal.proposal_id;
    const found = await env.adapter.getProposal("ws-alpha", proposalId);
    expect(found?.status).toBe("ACTIVE");

    const withdrawn = await env.adapter.withdrawProposal("ws-alpha", proposalId, "Design pivot");
    expect(withdrawn.status).toBe("WITHDRAWN");
  });

  it("06.T.12: repeated side-effect request is idempotent", async () => {
    const input = {
      workspace_id: "ws-alpha",
      base_revision: "rev-1",
      target_revision: "rev-2",
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_light_punch",
          current_damage: 25,
          proposed_damage: 30,
          reason: "Buff damage",
        },
      ],
      idempotency_key: "idempotency_test_key_42",
    };

    const res1 = await env.gateway.execute(env.llmDirector, "combat_create_proposal", input);
    const res2 = await env.gateway.execute(env.llmDirector, "combat_create_proposal", input);

    const cs1 = (res1.data as any).proposal;
    const cs2 = (res2.data as any).proposal;

    expect(cs1.proposal_id).toBe(cs2.proposal_id);
    expect(cs1.created_at).toBe(cs2.created_at);
  });
});
