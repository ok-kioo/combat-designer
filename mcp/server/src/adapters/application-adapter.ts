import type {
  SimulationPort,
  MechanicalGatePort,
  CombatQueryPort,
  ChangeSetRepositoryPort,
  AttackSummary,
  ImpactAnalysisResult,
  ProvenanceInfo,
  ScenarioSummary,
} from "@combat-designer/application";
import {
  searchCombatUseCase,
  getAttackUseCase,
  simulateCombatUseCase,
  verifyCombatUseCase,
  proposeChangesetUseCase,
  getChangesetUseCase,
  withdrawChangesetUseCase,
  approveChangesetUseCase,
  applyChangesetUseCase,
} from "@combat-designer/application";
import type {
  Principal,
  SimulationInput,
  SimulationOutput,
  VerificationRequest,
  GateResult,
  ChangeSetProposal,
  ChangeSetMutation,
} from "@combat-designer/shared-contracts";

export interface ApplicationPortsBundle {
  simulationPort: SimulationPort;
  gatePort: MechanicalGatePort;
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

  async verify(request: VerificationRequest, precomputedSimulation?: SimulationOutput): Promise<GateResult> {
    return await verifyCombatUseCase(this.ports.gatePort, this.ports.simulationPort, request, precomputedSimulation);
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

  async approveChangeset(
    principal: Principal,
    workspaceId: string,
    changesetId: string,
    currentRevision: string,
    gateResult: GateResult,
    simulationOutput: SimulationOutput,
    decision: "approve" | "reject",
    rejectionReason?: string
  ): Promise<ChangeSetProposal> {
    return await approveChangesetUseCase(this.ports.changesetRepo, principal, {
      workspace_id: workspaceId,
      changeset_id: changesetId,
      current_project_revision: currentRevision,
      gate_result: gateResult,
      simulation_output: simulationOutput,
      decision,
      rejection_reason: rejectionReason,
    });
  }

  async applyChangeset(
    principal: Principal,
    workspaceId: string,
    changesetId: string,
    currentRevision: string,
    canonicalSnapshotHash: string,
    simulationInputHash: string,
    simulationOutput: SimulationOutput,
    gateResult: GateResult,
    approverPrincipal?: Principal
  ): Promise<ChangeSetProposal> {
    return await applyChangesetUseCase(this.ports.changesetRepo, principal, {
      workspace_id: workspaceId,
      changeset_id: changesetId,
      current_project_revision: currentRevision,
      canonical_snapshot_hash: canonicalSnapshotHash,
      simulation_input_hash: simulationInputHash,
      simulation_output: simulationOutput,
      gate_result: gateResult,
      approver_principal: approverPrincipal,
    });
  }
}
