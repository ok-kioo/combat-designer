import type {
  SimulationPort,
  CombatAnalysisPort,
  CombatQueryPort,
  ProposalRepositoryPort,
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
  createProposalUseCase,
  getProposalUseCase,
  withdrawProposalUseCase,
} from "@combat-designer/backend";
import type {
  Principal,
  SimulationInput,
  SimulationOutput,
  VerificationRequest,
  CombatAnalysisResult,
  Proposal,
  ProposalMutation,
} from "@combat-designer/backend";

export interface ApplicationPortsBundle {
  simulationPort: SimulationPort;
  analysisPort: CombatAnalysisPort;
  queryPort: CombatQueryPort;
  proposalRepo: ProposalRepositoryPort;
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

  async createProposal(
    workspaceId: string,
    baseRevision: string,
    targetRevision: string,
    proposedBy: string,
    mutations: ProposalMutation[],
    idempotencyKey?: string
  ): Promise<Proposal> {
    return await createProposalUseCase(this.ports.proposalRepo, {
      workspace_id: workspaceId,
      base_revision: baseRevision,
      target_revision: targetRevision,
      proposed_by: proposedBy,
      mutations,
      idempotency_key: idempotencyKey,
    });
  }

  async getProposal(workspaceId: string, proposalId: string): Promise<Proposal | null> {
    return await getProposalUseCase(this.ports.proposalRepo, workspaceId, proposalId);
  }

  async withdrawProposal(workspaceId: string, proposalId: string, reason: string): Promise<Proposal> {
    return await withdrawProposalUseCase(this.ports.proposalRepo, workspaceId, proposalId, reason);
  }
}
