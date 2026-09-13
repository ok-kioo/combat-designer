import type {
  SimulationPort,
  CombatAnalysisPort,
  CombatQueryPort,
  ChangeSetRepositoryPort,
  AttackSummary,
  ImpactAnalysisResult,
  ProvenanceInfo,
  ScenarioSummary,
} from "@combat-designer/backend";
import {
  searchCombatUseCase,
  getAttackUseCase,
  simulateCombatUseCase,
  analyzeCombatUseCase,
  proposeChangesetUseCase,
  getChangesetUseCase,
  withdrawChangesetUseCase,
} from "@combat-designer/backend";
import type {
  Principal,
  SimulationInput,
  SimulationOutput,
  VerificationRequest,
  CombatAnalysisResult,
  ChangeSetProposal,
  ChangeSetMutation,
} from "@combat-designer/backend";

export interface ApplicationPortsBundle {
  simulationPort: SimulationPort;
  analysisPort: CombatAnalysisPort;
  queryPort: CombatQueryPort;
  changesetRepo: ChangeSetRepositoryPort;
}

export class ApplicationAdapter {
  constructor(private ports: ApplicationPortsBundle) {}

  async searchCombat(workspaceId: string, query?: string, tag?: string, minCancelWindow?: number, limit?: number): Promise<AttackSummary[]> {
    return await searchCombatUseCase(this.ports.queryPort, {
      workspace_id: workspaceId,
      query,
      tag,
      min_cancel_window: minCancelWindow,
      limit,
    });
  }

  async getAttack(workspaceId: string, attackId: string): Promise<AttackSummary | null> {
    return await getAttackUseCase(this.ports.queryPort, workspaceId, attackId);
  }

  async getImpactAnalysis(workspaceId: string, attackId: string): Promise<ImpactAnalysisResult> {
    return await this.ports.queryPort.getImpactAnalysis(workspaceId, attackId);
  }

  async getProvenance(workspaceId: string, assetId: string): Promise<ProvenanceInfo | null> {
    return await this.ports.queryPort.getProvenance(workspaceId, assetId);
  }

  async listScenarios(workspaceId: string): Promise<ScenarioSummary[]> {
    return await this.ports.queryPort.getScenarios(workspaceId);
  }

  async simulate(input: SimulationInput): Promise<SimulationOutput> {
    return await simulateCombatUseCase(this.ports.simulationPort, input);
  }

  async analyze(request: VerificationRequest, precomputedSimulation?: SimulationOutput): Promise<CombatAnalysisResult> {
    return await analyzeCombatUseCase(this.ports.analysisPort, this.ports.simulationPort, request, precomputedSimulation);
  }

  async proposeChangeset(
    workspaceId: string,
    baseRevision: string,
    targetRevision: string,
    proposedBy: string,
    mutations: ChangeSetMutation[],
    idempotencyKey?: string
  ): Promise<ChangeSetProposal> {
    return await proposeChangesetUseCase(this.ports.changesetRepo, {
      workspace_id: workspaceId,
      base_revision: baseRevision,
      target_revision: targetRevision,
      proposed_by: proposedBy,
      mutations,
      idempotency_key: idempotencyKey,
    });
  }

  async getChangeset(workspaceId: string, changesetId: string): Promise<ChangeSetProposal | null> {
    return await getChangesetUseCase(this.ports.changesetRepo, workspaceId, changesetId);
  }

  async withdrawChangeset(workspaceId: string, changesetId: string, reason: string): Promise<ChangeSetProposal> {
    return await withdrawChangesetUseCase(this.ports.changesetRepo, workspaceId, changesetId, reason);
  }
}
