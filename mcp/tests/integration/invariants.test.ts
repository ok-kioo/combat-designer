import { describe, it, expect, beforeEach } from "vitest";
import { createTestEnvironment } from "./test-helper.js";

describe("SPEC 06 — Authority & Architectural Invariants (Section 33)", () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  it("Invariant: LLM cannot manufacture GateResult or SimulationResult", async () => {
    // Calling verify routes strictly through MechanicalGatePort
    const res = await env.gateway.execute(env.llmDirector, "combat_verify", {
      workspace_id: "ws-alpha",
      project_id: "proj-1",
      project_revision: "rev-1",
      canonical_snapshot_hash: "snap-1",
      simulation_input_hash: "sim-1",
      simulation_input: {
        workspace_id: "ws-alpha",
        project_id: "proj-1",
        model_revision: "rev-1",
        scenario: { scenario_id: "sc_1", actors: [{ actor_id: "hero" }] },
        config: { budget: { max_frames: 60, max_events: 100, max_state_transitions: 100, max_entities: 2 }, tick_rate: 60 },
      },
      rule_set_version: "1.0",
      verifier_version: "1.0",
    });

    const data = res.data as any;
    expect(data.source).toBe("mechanical_gate");
    expect(data.gate_result_hash).toBeDefined();
  });

  it("Invariant: LLM cannot manufacture HumanApproval", async () => {
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

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGate = await env.gatePort.verify({} as any, mockSim);

    await expect(
      env.adapter.approveChangeset(
        env.llmDirector,
        "ws-alpha",
        proposal.changeset_id,
        "rev-1",
        mockGate,
        mockSim,
        "approve"
      )
    ).rejects.toThrow(/Only human principals can approve changesets/);
  });

  it("Invariant: LLM cannot directly persist to canonical state", async () => {
    // Propose does not mutate
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
    expect(proposal.applied_at).toBeUndefined();

    // LLM calling apply is denied by gateway policy
    await expect(
      env.gateway.execute(env.llmDirector, "combat_apply_change", {
        workspace_id: "ws-alpha",
        changeset_id: proposal.changeset_id,
        approved_by: "llm",
        approved_at: new Date().toISOString(),
      })
    ).rejects.toThrow(/changeset:apply is strictly DENIED/);
  });

  it("Invariant: PROPOSED cannot become APPLIED directly", async () => {
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

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGate = await env.gatePort.verify({} as any, mockSim);

    await expect(
      env.adapter.applyChangeset(
        env.humanLead,
        "ws-alpha",
        proposal.changeset_id,
        "rev-1",
        "snap-1",
        "sim-1",
        mockSim,
        mockGate
      )
    ).rejects.toThrow(/Only 'approved' ChangeSets can be applied/);
  });

  it("Invariant: APPROVED cannot exist without human approval", async () => {
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

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGate = await env.gatePort.verify({} as any, mockSim);

    // Human approval works
    const approved = await env.adapter.approveChangeset(
      env.humanLead,
      "ws-alpha",
      proposal.changeset_id,
      "rev-1",
      mockGate,
      mockSim,
      "approve"
    );

    expect(approved.status).toBe("approved");
    expect(approved.approved_by).toBe(env.humanLead.principal_id);
  });

  it("Invariant: APPLIED cannot exist without Gate PASS", async () => {
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

    const mockSim = await env.simulationPort.simulate({} as any);
    env.gatePort.shouldFail = true;
    const mockGateFail = await env.gatePort.verify({} as any, mockSim);

    await expect(
      env.adapter.approveChangeset(
        env.humanLead,
        "ws-alpha",
        proposal.changeset_id,
        "rev-1",
        mockGateFail,
        mockSim,
        "approve"
      )
    ).rejects.toThrow(/Cannot approve ChangeSet without a valid PASS GateResult/);
  });

  it("Invariant: GateResult from workspace A cannot satisfy ChangeSet in workspace B", async () => {
    const proposalB = await env.adapter.proposeChangeset(
      "ws-beta",
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

    const mockSim = await env.simulationPort.simulate({} as any);
    const mockGateA = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha", // Originates in ws-alpha!
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap-1",
        simulation_input_hash: "sim-1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      mockSim
    );

    proposalB.status = "approved";
    proposalB.approved_by = env.humanLead.principal_id;
    proposalB.approved_at = new Date().toISOString();
    await env.changesetRepo.update(proposalB);

    // Attempting apply in ws-beta with GateResult from ws-alpha
    await expect(
      env.adapter.applyChangeset(
        { ...env.humanLead, authorized_workspaces: ["ws-beta"] },
        "ws-beta",
        proposalB.changeset_id,
        "rev-1",
        "snap-1",
        "sim-1",
        mockSim,
        mockGateA
      )
    ).rejects.toThrow(/GateResult workspace 'ws-alpha' does not match request workspace 'ws-beta'/);
  });

  it("Invariant: GateResult for simulation X cannot satisfy ChangeSet for simulation Y", async () => {
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

    const mockSimX = await env.simulationPort.simulate({} as any);
    const mockGateX = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap-1",
        simulation_input_hash: "sim-1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      mockSimX
    );

    await env.adapter.approveChangeset(
      env.humanLead,
      "ws-alpha",
      proposal.changeset_id,
      "rev-1",
      mockGateX,
      mockSimX,
      "approve"
    );

    // A different simulation Y with different state hash
    const mockSimY = {
      ...mockSimX,
      final_state_hash: "different_simulation_hash_diverged",
    };

    await expect(
      env.adapter.applyChangeset(
        env.humanLead,
        "ws-alpha",
        proposal.changeset_id,
        "rev-1",
        "snap-1",
        "sim-1",
        mockSimY,
        mockGateX,
        env.humanLead
      )
    ).rejects.toThrow(/Simulation output hash does not match the approved ChangeSet simulation hash/);
  });
});
