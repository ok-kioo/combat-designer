export interface CombatSearchFilter {
  workspace_id: string;
  query?: string;
  tag?: string;
  min_cancel_window?: number;
  limit?: number;
}

export interface AttackSummary {
  attack_id: string;
  name: string;
  startup_frames: number;
  active_frames: number;
  recovery_frames: number;
  damage: number;
  cancel_window?: {
    start_frame: number;
    end_frame: number;
  };
  tags?: string[];
  untrusted_text?: boolean;
}

export interface ImpactAnalysisResult {
  attack_id: string;
  dependent_combos_count: number;
  archetypes_affected: string[];
  cancel_transitions_count: number;
}

export interface ProvenanceInfo {
  asset_id: string;
  source_file: string;
  importer: string;
  imported_at: string;
  raw_label?: string;
  untrusted_text: boolean;
}

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  actor_count: number;
  description?: string;
}

export interface CombatQueryPort {
  searchAttacks(filter: CombatSearchFilter): Promise<AttackSummary[]>;
  getAttack(workspaceId: string, attackId: string): Promise<AttackSummary | null>;
  getImpactAnalysis(workspaceId: string, attackId: string): Promise<ImpactAnalysisResult>;
  getProvenance(workspaceId: string, assetId: string): Promise<ProvenanceInfo | null>;
  getScenarios(workspaceId: string): Promise<ScenarioSummary[]>;
}
