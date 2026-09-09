import { describe, it, expect, beforeEach } from "vitest";
import type {
  ChangeSetProposal,
  Principal,
  GateResult,
  SimulationOutput,
} from "@combat-designer/shared-contracts";
import type { ChangeSetRepositoryPort } from "../src/ports/changeset-repository-port.js";
import {
  proposeChangesetUseCase,
  getChangesetUseCase,
  withdrawChangesetUseCase,
  approveChangesetUseCase,
  applyChangesetUseCase,
} from "../src/index.js";

class InMemoryChangeSetRepository implements ChangeSetRepositoryPort {
  private store = new Map<string, ChangeSetProposal>();

  async save(proposal: ChangeSetProposal): Promise<ChangeSetProposal> {
    const key = `${proposal.workspace_id}:${proposal.changeset_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }

  async getById(workspaceId: string, changesetId: string): Promise<ChangeSetProposal | null> {
    const key = `${workspaceId}:${changesetId}`;
    const found = this.store.get(key);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<ChangeSetProposal | null> {
    for (const proposal of this.store.values()) {
      if (proposal.workspace_id === workspaceId && proposal.idempotency_key === idempotencyKey) {
        return JSON.parse(JSON.stringify(proposal));
      }
    }
    return null;
  }

  async update(proposal: ChangeSetProposal): Promise<ChangeSetProposal> {
    const key = `${proposal.workspace_id}:${proposal.changeset_id}`;
    this.store.set(key, JSON.parse(JSON.stringify(proposal)));
    return proposal;
  }
}

describe("ChangeSet Lifecycle & Application Boundaries", () => {
  let repo: InMemoryChangeSetRepository;

  beforeEach(() => {
    repo = new InMemoryChangeSetRepository();
  });

  const humanPrincipal: Principal = {
    principal_id: "human_lead",
    principal_type: "human",
    capabilities: ["combat:read", "combat:propose", "changeset:approve", "changeset:apply"],
    authorized_workspaces: ["ws-1"],
  };

  const llmPrincipal: Principal = {
    principal_id: "llm_combat_director",
    principal_type: "llm",
    capabilities: ["combat:read", "combat:query", "combat:simulate", "combat:verify", "combat:propose"],
    authorized_workspaces: ["ws-1"],
  };

  const mockSimulation: SimulationOutput = {
    status: "COMPLETED",
    total_frames: 120,
    events: [],
    final_state_hash: "hash_sim_state_abc",
    metrics: {
      total_frames: 120,
      damage: 10,
      hits: 1,
      blocked_hits: 0,
      misses: 0,
      stun_frames: 0,
      recovery_frames: 10,
      resource_spent: 5,
      resource_remaining: 95,
      state_transitions: 2,
      cancel_count: 0,
      launch_count: 0,
      juggle_count: 0,
    },
  };

  const mockGatePass: GateResult = {
    workspace_id: "ws-1",
    project_revision: "rev-1",
    canonical_snapshot_hash: "snap_hash_abc",
    simulation_input_hash: "sim_input_hash_xyz",
    simulation_state_hash: "hash_sim_state_abc",
    event_log_hash: "event_log_hash_123",
    verification_profile: "strict",
    gate_run_id: "gate-run-777",
    rule_set_version: "1.0.0",
    verifier_version: "1.0.0",
    verdict: "PASS",
    checks: [],
    violations: [],
    evidence: [],
    budgets: {
      exhausted: false,
      events_analyzed: 10,
      states_explored: 5,
      cycles_checked: 0,
      steps_taken: 15,
      evidence_count: 0,
    },
    gate_result_hash: "gate_hash_pass_1234567890123456789012345678901234567890123456789012345678901234",
  };

  it("proposes a changeset in 'proposed' status and preserves idempotency", async () => {
    const proposal1 = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Boost light attack damage",
        },
      ],
      idempotency_key: "idem-key-001",
    });

    expect(proposal1.status).toBe("proposed");
    expect(proposal1.applied_at).toBeUndefined();

    // Idempotent retry returns identical proposal
    const proposal2 = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Boost light attack damage",
        },
      ],
      idempotency_key: "idem-key-001",
    });

    expect(proposal2.changeset_id).toBe(proposal1.changeset_id);
  });

  it("rejects approval by LLM principal (HUMAN_APPROVAL_REQUIRED)", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    await expect(
      approveChangesetUseCase(repo, llmPrincipal, {
        workspace_id: "ws-1",
        changeset_id: proposal.changeset_id,
        current_project_revision: "rev-1",
        gate_result: mockGatePass,
        simulation_output: mockSimulation,
        decision: "approve",
      })
    ).rejects.toThrow(/Only human principals can approve changesets/);
  });

  it("allows approval by authenticated human principal with GateResult PASS", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    const approved = await approveChangesetUseCase(repo, humanPrincipal, {
      workspace_id: "ws-1",
      changeset_id: proposal.changeset_id,
      current_project_revision: "rev-1",
      gate_result: mockGatePass,
      simulation_output: mockSimulation,
      decision: "approve",
    });

    expect(approved.status).toBe("approved");
    expect(approved.approved_by).toBe(humanPrincipal.principal_id);
    expect(approved.approved_at).toBeDefined();
  });

  it("rejects approval if GateResult verdict is not PASS", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    const gateFail: GateResult = {
      ...mockGatePass,
      verdict: "FAIL",
    };

    await expect(
      approveChangesetUseCase(repo, humanPrincipal, {
        workspace_id: "ws-1",
        changeset_id: proposal.changeset_id,
        current_project_revision: "rev-1",
        gate_result: gateFail,
        simulation_output: mockSimulation,
        decision: "approve",
      })
    ).rejects.toThrow(/Cannot approve ChangeSet without a valid PASS GateResult/);
  });

  it("applies an approved changeset when all preconditions are satisfied", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    await approveChangesetUseCase(repo, humanPrincipal, {
      workspace_id: "ws-1",
      changeset_id: proposal.changeset_id,
      current_project_revision: "rev-1",
      gate_result: mockGatePass,
      simulation_output: mockSimulation,
      decision: "approve",
    });

    const applied = await applyChangesetUseCase(repo, humanPrincipal, {
      workspace_id: "ws-1",
      changeset_id: proposal.changeset_id,
      current_project_revision: "rev-1",
      canonical_snapshot_hash: "snap_hash_abc",
      simulation_input_hash: "sim_input_hash_xyz",
      simulation_output: mockSimulation,
      gate_result: mockGatePass,
      approver_principal: humanPrincipal,
    });

    expect(applied.status).toBe("applied");
    expect(applied.applied_at).toBeDefined();

    // Replay attack rejected
    await expect(
      applyChangesetUseCase(repo, humanPrincipal, {
        workspace_id: "ws-1",
        changeset_id: proposal.changeset_id,
        current_project_revision: "rev-1",
        canonical_snapshot_hash: "snap_hash_abc",
        simulation_input_hash: "sim_input_hash_xyz",
        simulation_output: mockSimulation,
        gate_result: mockGatePass,
        approver_principal: humanPrincipal,
      })
    ).rejects.toThrow(/Replay detected/);
  });

  it("rejects apply if LLM principal attempts to apply directly", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    await expect(
      applyChangesetUseCase(repo, llmPrincipal, {
        workspace_id: "ws-1",
        changeset_id: proposal.changeset_id,
        current_project_revision: "rev-1",
        canonical_snapshot_hash: "snap_hash_abc",
        simulation_input_hash: "sim_input_hash_xyz",
        simulation_output: mockSimulation,
        gate_result: mockGatePass,
      })
    ).rejects.toThrow(/lacks required capability 'changeset:apply'/);
  });

  it("rejects apply if revision race is detected (stale revision)", async () => {
    const proposal = await proposeChangesetUseCase(repo, {
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: llmPrincipal.principal_id,
      mutations: [
        {
          type: "attack_damage",
          attack_id: "atk_1",
          current_damage: 10,
          proposed_damage: 15,
          reason: "Buff",
        },
      ],
    });

    await approveChangesetUseCase(repo, humanPrincipal, {
      workspace_id: "ws-1",
      changeset_id: proposal.changeset_id,
      current_project_revision: "rev-1",
      gate_result: mockGatePass,
      simulation_output: mockSimulation,
      decision: "approve",
    });

    // Project revision advanced from rev-1 to rev-2
    await expect(
      applyChangesetUseCase(repo, humanPrincipal, {
        workspace_id: "ws-1",
        changeset_id: proposal.changeset_id,
        current_project_revision: "rev-2",
        canonical_snapshot_hash: "snap_hash_abc",
        simulation_input_hash: "sim_input_hash_xyz",
        simulation_output: mockSimulation,
        gate_result: mockGatePass,
        approver_principal: humanPrincipal,
      })
    ).rejects.toThrow(/Revision race detected/);
  });
});
