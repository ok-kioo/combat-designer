import type {
  SimulationPort,
  MechanicalGatePort,
  CombatQueryPort,
  ChangeSetRepositoryPort,
  AttackSummary,
  ImpactAnalysisResult,
  ProvenanceInfo,
  ScenarioSummary,
} from "@combat-designer/backend";
import type {
  Principal,
  SimulationInput,
  SimulationOutput,
  VerificationRequest,
  GateResult,
  ChangeSetProposal,
} from "@combat-designer/backend";
import { ApplicationAdapter } from "../../server/src/adapters/application-adapter.js";
import { McpGatewayRouter } from "../../gateway/src/routing/router.js";
import { CombatDesignerMcpServer } from "../../server/src/mcp-server.js";

export class InMemoryChangeSetRepo implements ChangeSetRepositoryPort {
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

  clear(): void {
    this.store.clear();
  }
}

export class MockCombatQueryAdapter implements CombatQueryPort {
  private attacks = new Map<string, AttackSummary>([
    [
      "atk_light_punch",
      {
        attack_id: "atk_light_punch",
        name: "Light Punch",
        startup_frames: 4,
        active_frames: 3,
        recovery_frames: 8,
        damage: 25,
        cancel_window: { start_frame: 7, end_frame: 12 },
        tags: ["light", "punch"],
      },
    ],
    [
      "atk_heavy_cleave",
      {
        attack_id: "atk_heavy_cleave",
        name: "Heavy Cleave",
        startup_frames: 18,
        active_frames: 6,
        recovery_frames: 24,
        damage: 120,
        cancel_window: { start_frame: 22, end_frame: 28 },
        tags: ["heavy", "cleave"],
      },
    ],
  ]);

  async searchAttacks(filter: { workspace_id: string; query?: string; tag?: string; min_cancel_window?: number }): Promise<AttackSummary[]> {
    const results: AttackSummary[] = [];
    for (const atk of this.attacks.values()) {
      if (filter.query && !atk.name.toLowerCase().includes(filter.query.toLowerCase())) continue;
      if (filter.tag && !atk.tags?.includes(filter.tag)) continue;
      if (filter.min_cancel_window && atk.cancel_window) {
        const windowSize = atk.cancel_window.end_frame - atk.cancel_window.start_frame;
        if (windowSize < filter.min_cancel_window) continue;
      }
      results.push(atk);
    }
    return results;
  }

  async getAttack(workspaceId: string, attackId: string): Promise<AttackSummary | null> {
    return this.attacks.get(attackId) ?? null;
  }

  async getImpactAnalysis(workspaceId: string, attackId: string): Promise<ImpactAnalysisResult> {
    return {
      attack_id: attackId,
      dependent_combos_count: 2,
      archetypes_affected: ["brawler", "duelist"],
      cancel_transitions_count: 3,
    };
  }

  async getProvenance(workspaceId: string, assetId: string): Promise<ProvenanceInfo | null> {
    return {
      asset_id: assetId,
      source_file: "Assets/Characters/Hero/Attacks.json",
      importer: "UnityBundleExtractor",
      imported_at: "2026-09-09T12:00:00Z",
      raw_label: "Punch_01_Raw",
      untrusted_text: true,
    };
  }

  async getScenarios(workspaceId: string): Promise<ScenarioSummary[]> {
    return [
      { scenario_id: "sc_combo_test", name: "Combo Loop Test", actor_count: 2 },
    ];
  }
}

export class MockSimulatorAdapter implements SimulationPort {
  async simulate(input: SimulationInput): Promise<SimulationOutput> {
    return {
      status: "COMPLETED",
      total_frames: 120,
      events: [
        { frame: 1, actor_id: "hero", event_type: "AttackStarted", sequence: 1, attack_id: "atk_light_punch" },
        { frame: 5, actor_id: "hero", event_type: "HitboxActivated", sequence: 2 },
        { frame: 6, actor_id: "enemy", event_type: "HitDetected", sequence: 3 },
      ],
      final_state_hash: "mock_state_hash_1234567890abcdef",
      metrics: {
        total_frames: 120,
        damage: 25,
        hits: 1,
        blocked_hits: 0,
        misses: 0,
        stun_frames: 12,
        recovery_frames: 8,
        resource_spent: 0,
        resource_remaining: 100,
        state_transitions: 3,
        cancel_count: 0,
        launch_count: 0,
        juggle_count: 0,
      },
    };
  }
}

export class MockMechanicalGateAdapter implements MechanicalGatePort {
  public shouldFail = false;
  public customVerdict?: any;

  async verify(request: VerificationRequest, simulation: SimulationOutput): Promise<GateResult> {
    const verdict = this.customVerdict ?? (this.shouldFail ? "FAIL" : "PASS");
    return {
      gate_run_id: "gate_run_mock_777",
      workspace_id: request.workspace_id ?? "ws-alpha",
      project_revision: request.project_revision ?? "rev-1",
      canonical_snapshot_hash: request.canonical_snapshot_hash ?? "snap_hash",
      simulation_input_hash: request.simulation_input_hash ?? "sim_hash",
      simulation_state_hash: simulation?.final_state_hash ?? "mock_state_hash",
      event_log_hash: "mock_event_log_hash_888",
      verification_profile: request.verification_profile?.kind ?? "strict",
      rule_set_version: request.rule_set_version ?? "1.0.0",
      verifier_version: request.verifier_version ?? "1.0.0",
      verdict,
      checks: [
        {
          rule_id: "G01_SIMULATION_INTEGRITY",
          scenario_id: "sc_1",
          status: verdict === "PASS" ? "PASS" : "FAIL",
          threshold: 0,
          observed: 0,
          expected: "Valid",
          message: verdict === "PASS" ? "Integrity passed" : "Integrity violated",
        },
      ],
      violations: verdict === "PASS" ? [] : ["INFINITE_STUN_LOOP"],
      evidence: [],
      budgets: {
        exhausted: false,
        events_analyzed: 10,
        states_explored: 5,
        cycles_checked: 0,
        steps_taken: 15,
        evidence_count: 0,
      },
      gate_result_hash: "mock_gate_result_hash_999999999999999999999999999999999999999999999999",
    };
  }
}

export function createTestEnvironment() {
  const changesetRepo = new InMemoryChangeSetRepo();
  const queryPort = new MockCombatQueryAdapter();
  const simulationPort = new MockSimulatorAdapter();
  const gatePort = new MockMechanicalGateAdapter();

  const adapter = new ApplicationAdapter({
    changesetRepo,
    queryPort,
    simulationPort,
    gatePort,
  });

  const gateway = new McpGatewayRouter();
  const server = new CombatDesignerMcpServer(gateway, adapter);

  const humanLead: Principal = {
    principal_id: "human_lead",
    principal_type: "human",
    capabilities: [
      "combat:read",
      "combat:query",
      "combat:simulate",
      "combat:verify",
      "combat:propose",
      "changeset:withdraw",
      "changeset:approve",
      "changeset:apply",
    ],
    authorized_workspaces: ["ws-alpha"],
  };

  const llmDirector: Principal = {
    principal_id: "llm_director",
    principal_type: "llm",
    capabilities: [
      "combat:read",
      "combat:query",
      "combat:simulate",
      "combat:verify",
      "combat:propose",
      "changeset:withdraw",
    ],
    authorized_workspaces: ["ws-alpha"],
  };

  const unauthorizedPrincipal: Principal = {
    principal_id: "outsider",
    principal_type: "human",
    capabilities: ["combat:read"],
    authorized_workspaces: ["ws-beta"],
  };

  return {
    changesetRepo,
    queryPort,
    simulationPort,
    gatePort,
    adapter,
    gateway,
    server,
    humanLead,
    llmDirector,
    unauthorizedPrincipal,
  };
}
