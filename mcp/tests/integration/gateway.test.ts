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

  it("06.T.3: authorized verification succeeds and returns authoritative GateResult", async () => {
    const result = await env.gateway.execute(env.llmDirector, "combat_verify", {
      workspace_id: "ws-alpha",
      project_id: "proj-1",
      project_revision: "rev-1",
      canonical_snapshot_hash: "snap_hash_1",
      simulation_input_hash: "sim_hash_1",
      simulation_input: {
        workspace_id: "ws-alpha",
        project_id: "proj-1",
        model_revision: "rev-1",
        scenario: { scenario_id: "sc_1", actors: [] },
        inputs: [],
        config: { budget: { max_frames: 60, max_events: 100, max_state_transitions: 100, max_entities: 2 }, tick_rate: 60 },
      },
      verification_profile: "strict",
      verification_budget: {
        max_events: 1000,
        max_states: 1000,
        max_cycles: 100,
        max_steps: 5000,
      },
      rule_set_version: "1.0.0",
      verifier_version: "1.0.0",
    });

    expect(result.classification).toBe("SIMULATION_RESULT");
    const data = result.data as any;
    expect(data.source).toBe("mechanical_gate");
    expect(data.verdict).toBe("PASS");
    expect(data.gate_result_hash).toBeDefined();
  });

  it("06.T.4: unauthorized operation is strictly denied (deny-by-default)", async () => {
    // LLM trying to apply changeset
    await expect(
      env.gateway.execute(env.llmDirector, "combat_apply_change", {
        workspace_id: "ws-alpha",
        changeset_id: "cs-123",
        approved_by: "llm_director",
        approved_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/changeset:apply is strictly DENIED/);

    // Unknown tool
    await expect(
      env.gateway.execute(env.humanLead, "arbitrary_nonexistent_tool", {
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
    const result = await env.gateway.execute(env.llmDirector, "combat_propose_change", {
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
    expect(data.proposal.status).toBe("proposed");
    expect(data.proposal.applied_at).toBeUndefined();

    // Verify stored proposal in repository is strictly in 'proposed' state
    const stored = await env.changesetRepo.getById("ws-alpha", data.proposal.changeset_id);
    expect(stored?.status).toBe("proposed");
    expect(stored?.applied_at).toBeUndefined();
  });

  it("06.T.10: apply requires valid human approval (APPROVAL_REQUIRED)", async () => {
    const proposeRes = await env.gateway.execute(env.llmDirector, "combat_propose_change", {
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
    const changesetId = (proposeRes.data as any).proposal.changeset_id;

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGate = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      mockSim
    );

    // Attempt apply without approve use case
    await expect(
      env.gateway.execute(env.humanLead, "combat_apply_change", {
        workspace_id: "ws-alpha",
        changeset_id: changesetId,
        current_project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_output: mockSim,
        gate_result: mockGate,
        approved_by: "someone",
        approved_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/Only 'approved' ChangeSets can be applied/);
  });

  it("06.T.11: stale apply is rejected (STALE_REVISION)", async () => {
    const proposeRes = await env.gateway.execute(env.llmDirector, "combat_propose_change", {
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
    const changesetId = (proposeRes.data as any).proposal.changeset_id;

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGate = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      mockSim
    );

    // Approve under rev-1
    await env.adapter.approveChangeset(
      env.humanLead,
      "ws-alpha",
      changesetId,
      "rev-1",
      mockGate,
      mockSim,
      "approve"
    );

    // Project revision advanced from rev-1 to rev-2 before apply
    await expect(
      env.gateway.execute(env.humanLead, "combat_apply_change", {
        workspace_id: "ws-alpha",
        changeset_id: changesetId,
        current_project_revision: "rev-2", // Stale!
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_output: mockSim,
        gate_result: mockGate,
        approved_by: env.humanLead.principal_id,
        approved_at: new Date().toISOString(),
        approver_principal: env.humanLead,
      })
    ).rejects.toThrow(/Revision race detected/);
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

    const res1 = await env.gateway.execute(env.llmDirector, "combat_propose_change", input);
    const res2 = await env.gateway.execute(env.llmDirector, "combat_propose_change", input);

    const cs1 = (res1.data as any).proposal;
    const cs2 = (res2.data as any).proposal;

    expect(cs1.changeset_id).toBe(cs2.changeset_id);
    expect(cs1.created_at).toBe(cs2.created_at);
  });
});
