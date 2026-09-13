import type { WorkspaceRepositoryPort } from "../domain/repository/workspace-repository-port.js";
import type { CharacterRepositoryPort } from "../../combat/domain/repository/character-repository-port.js";
import type { ComboRepositoryPort } from "../../combat/domain/repository/combo-repository-port.js";
import type { AnalysisRepositoryPort } from "../../combat/domain/repository/analysis-repository-port.js";
import type { CanonicalAttack } from "../../ingestion/domain/entity/snapshot.js";

export interface WorkspaceOverviewQuery {
  workspace_id: string;
}

export interface WorkspaceProductActivity {
  id: string;
  type:
    | "combo_created"
    | "combo_discovered"
    | "analysis_completed"
    | "recommendation_generated"
    | "data_imported"
    | "character_detected"
    | "mechanical_issue_detected";
  label: string;
  description?: string;
  timestamp: string;
}

export interface WorkspaceKpis {
  characters_count: number;
  attacks_count: number;
  unassigned_attacks_count: number;
  combos_count: number;
  user_combos_count: number;
  ai_combos_count: number;
  average_combo_damage: number | null;
  max_combo_damage: number | null;
  max_combo_hits: number | null;
  analyses_count: number;
  mechanical_issues_count: number;
}

export interface WorkspaceOverviewResult {
  workspace: {
    id: string;
    name: string;
    description?: string;
    engine?: string;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
  };
  has_data: boolean;
  kpis: WorkspaceKpis;
  recent_activity: WorkspaceProductActivity[];
  recent_recommendations: Array<{
    id: string;
    analysis_id: string;
    title: string;
    description: string;
    suggested_action: string;
    created_at: string;
  }>;
  quick_actions: Array<{
    action_id: string;
    label: string;
    target_tab: string;
    description: string;
  }>;
}

export interface WorkspaceOverviewDependencies {
  workspaceRepo: WorkspaceRepositoryPort;
  characterRepo: CharacterRepositoryPort;
  comboRepo: ComboRepositoryPort;
  analysisRepo: AnalysisRepositoryPort;
  getAttacks: (workspaceId: string) => Promise<CanonicalAttack[]>;
  getActivities?: (workspaceId: string) => Promise<WorkspaceProductActivity[]>;
}

export class GetWorkspaceOverviewUseCase {
  constructor(private readonly deps: WorkspaceOverviewDependencies) {}

  public async execute(query: WorkspaceOverviewQuery): Promise<WorkspaceOverviewResult> {
    const ws = await this.deps.workspaceRepo.findById(query.workspace_id);
    if (!ws) {
      throw new Error(`Workspace '${query.workspace_id}' not found`);
    }

    const characters = await this.deps.characterRepo.findByWorkspace(query.workspace_id);
    const attacks = await this.deps.getAttacks(query.workspace_id);
    const combos = await this.deps.comboRepo.findByWorkspace(query.workspace_id);
    const analyses = await this.deps.analysisRepo.findByWorkspace(query.workspace_id);

    const unassignedAttacks = attacks.filter(
      (a) => !a.character_id || a.assignment_status === "UNASSIGNED"
    );

    const userCombos = combos.filter((c) => c.source === "USER_CREATED");
    const aiCombos = combos.filter((c) => c.source === "AI_DISCOVERED");

    // Compute metrics from valid evaluations only
    let totalEvalDamage = 0;
    let evalCount = 0;
    let maxDamage: number | null = null;
    let maxHits: number | null = null;

    for (const combo of combos) {
      const evaluation = await this.deps.comboRepo.getEvaluation(combo.id);
      if (evaluation && !evaluation.is_stale) {
        totalEvalDamage += evaluation.damage;
        evalCount++;
        if (maxDamage === null || evaluation.damage > maxDamage) {
          maxDamage = evaluation.damage;
        }
        if (maxHits === null || evaluation.hits > maxHits) {
          maxHits = evaluation.hits;
        }
      } else if (combo.steps.length > 0) {
        // Approximate hits from step count if no simulation evaluation yet
        if (maxHits === null || combo.steps.length > maxHits) {
          maxHits = combo.steps.length;
        }
      }
    }

    const avgDamage = evalCount > 0 ? Math.round(totalEvalDamage / evalCount) : null;

    // Count mechanical issues from findings
    let mechanicalIssuesCount = 0;
    const recommendations: WorkspaceOverviewResult["recent_recommendations"] = [];

    for (const an of analyses) {
      const issues = an.findings.filter(
        (f) => f.type === "loop_detected" || f.type === "excessive_damage" || f.type === "lacks_counterplay" || f.severity === "high" || f.severity === "critical"
      );
      mechanicalIssuesCount += issues.length;

      for (const rec of an.recommendations) {
        recommendations.push({
          id: rec.id,
          analysis_id: an.id,
          title: rec.title,
          description: rec.description,
          suggested_action: rec.suggested_action,
          created_at: an.created_at,
        });
      }
    }

    const hasData = attacks.length > 0 || characters.length > 0 || combos.length > 0;

    // Product activities
    let activities: WorkspaceProductActivity[] = [];
    if (this.deps.getActivities) {
      activities = await this.deps.getActivities(query.workspace_id);
    } else {
      // Derive product activity from entities
      if (combos.length > 0) {
        const latestCombo = combos[combos.length - 1];
        activities.push({
          id: `act-combo-${latestCombo.id}`,
          type: latestCombo.source === "AI_DISCOVERED" ? "combo_discovered" : "combo_created",
          label: `Combo "${latestCombo.name}" ${latestCombo.source === "AI_DISCOVERED" ? "descoberto pela IA" : "criado"}`,
          description: `${latestCombo.steps.length} golpes sequenciados`,
          timestamp: latestCombo.created_at,
        });
      }
      if (analyses.length > 0) {
        const latestAnalysis = analyses[0];
        activities.push({
          id: `act-an-${latestAnalysis.id}`,
          type: "analysis_completed",
          label: `Análise concluída: ${latestAnalysis.subject}`,
          description: `${latestAnalysis.findings.length} achados e ${latestAnalysis.recommendations.length} recomendações`,
          timestamp: latestAnalysis.created_at,
        });
      }
      if (characters.length > 0) {
        activities.push({
          id: `act-chars-${query.workspace_id}`,
          type: "character_detected",
          label: `${characters.length} personagem(ns) ativo(s) no projeto`,
          timestamp: ws.updated_at,
        });
      }
      if (attacks.length > 0) {
        activities.push({
          id: `act-data-${query.workspace_id}`,
          type: "data_imported",
          label: `${attacks.length} golpes carregados no snapshot atual`,
          timestamp: ws.updated_at,
        });
      }
    }

    return {
      workspace: {
        id: ws.id,
        name: ws.name,
        description: ws.description,
        engine: ws.engine,
        status: ws.status,
        created_at: ws.created_at,
        updated_at: ws.updated_at,
      },
      has_data: hasData,
      kpis: {
        characters_count: characters.length,
        attacks_count: attacks.length,
        unassigned_attacks_count: unassignedAttacks.length,
        combos_count: combos.length,
        user_combos_count: userCombos.length,
        ai_combos_count: aiCombos.length,
        average_combo_damage: avgDamage,
        max_combo_damage: maxDamage,
        max_combo_hits: maxHits,
        analyses_count: analyses.length,
        mechanical_issues_count: mechanicalIssuesCount,
      },
      recent_activity: activities.slice(0, 5),
      recent_recommendations: recommendations.slice(0, 5),
      quick_actions: [
        {
          action_id: "find_combo",
          label: "Encontrar Combo",
          target_tab: "combos",
          description: "Pesquise rotas de combo com IA e validação determinística.",
        },
        {
          action_id: "analyze_attack",
          label: "Analisar Golpe",
          target_tab: "catalog",
          description: "Inspecione janelas de startup, recovery e balanceamento de dano.",
        },
        {
          action_id: "create_combo",
          label: "Criar Combo Manual",
          target_tab: "combos",
          description: "Monte sequências de golpes com o Combo Builder interativo.",
        },
        {
          action_id: "ask_director",
          label: "Perguntar ao Combat Director",
          target_tab: "chat",
          description: "Converse com o assistente especializado em sistemas de combate.",
        },
        {
          action_id: "import_data",
          label: "Importar Dados",
          target_tab: "import",
          description: "Importe novo bundle de ScriptableObjects exportados da Unity.",
        },
      ],
    };
  }
}
