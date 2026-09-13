export interface WorkspaceOverviewData {
  workspace: {
    id: string;
    name: string;
    description?: string;
    engine?: string;
    status: "active" | "archived";
  };
  has_data: boolean;
  kpis: {
    characters_count: number;
    attacks_count: number;
    unassigned_attacks_count: number;
    combos_count: number;
    user_combos_count: number;
    ai_combos_count: number;
    analyses_count: number;
    mechanical_issues_count: number;
  };
  recent_activity: Array<{
    id: string;
    label: string;
    description?: string;
    timestamp: string;
  }>;
  recent_recommendations: Array<{
    id: string;
    title: string;
    description: string;
    suggested_action: string;
  }>;
  quick_actions?: Array<{
    action_id: string;
    label: string;
    target_tab: string;
    description: string;
  }>;
}

export class WorkspaceOverviewController {
  constructor(private data: WorkspaceOverviewData) {}

  public renderHtml(): string {
    const { workspace, has_data, kpis, recent_activity, recent_recommendations } = this.data;

    if (!has_data) {
      return `
        <div class="overview-empty-state">
          <div class="empty-banner">
            <h2>Bem-vindo ao projeto <strong>${escapeHtml(workspace.name)}</strong>! 🥋</h2>
            <p>
              Este workspace ainda não possui dados importados da engine ou golpes cadastrados.
              Comece importando seu bundle de combate da Unity para desbloquear o catálogo, simulações e o Combat Director.
            </p>
            <div class="empty-actions">
              <button class="btn btn-success btn-lg" onclick="window.switchTab('import')">
                📥 Importar Dados da Engine Unity
              </button>
              <button class="btn btn-secondary" onclick="window.switchTab('help')">
                📖 Ver Guia de Início Rápido
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const activityListHtml =
      recent_activity.length > 0
        ? recent_activity
            .slice(0, 5)
            .map(
              (act) => `
          <div class="activity-item">
            <span class="activity-icon">📌</span>
            <div class="activity-body">
              <div class="activity-label">${escapeHtml(act.label)}</div>
              ${act.description ? `<div class="activity-desc">${escapeHtml(act.description)}</div>` : ""}
            </div>
            <span class="activity-time">${formatTime(act.timestamp)}</span>
          </div>
        `
            )
            .join("")
        : `<div class="text-dim" style="padding: 12px 0;">Nenhuma atividade recente registrada.</div>`;

    const recsListHtml =
      recent_recommendations.length > 0
        ? recent_recommendations
            .slice(0, 3)
            .map(
              (rec) => `
          <div class="recommendation-card">
            <h4>💡 ${escapeHtml(rec.title)}</h4>
            <p>${escapeHtml(rec.description)}</p>
            <div class="rec-action">
              <strong>Ação sugerida:</strong> ${escapeHtml(rec.suggested_action)}
            </div>
          </div>
        `
            )
            .join("")
        : `<div class="text-dim" style="padding: 12px 0;">Nenhuma recomendação pendente no momento. Peça uma análise ao Diretor no chat!</div>`;

    return `
      <div class="workspace-overview-view">
        <div class="overview-header-card">
          <h2>${escapeHtml(workspace.name)}</h2>
          <p>${escapeHtml(workspace.description || "Projeto de combate ativo.")}</p>
        </div>

        <!-- KPIs Cards -->
        <div class="kpis-grid">
          <div class="kpi-card" onclick="window.switchTab('characters')">
            <div class="kpi-icon">🥋</div>
            <div class="kpi-number">${kpis.characters_count}</div>
            <div class="kpi-label">Personagens</div>
          </div>

          <div class="kpi-card" onclick="window.switchTab('catalog')">
            <div class="kpi-icon">⚔️</div>
            <div class="kpi-number">${kpis.attacks_count}</div>
            <div class="kpi-label">Golpes Canônicos</div>
            ${kpis.unassigned_attacks_count > 0 ? `<div class="kpi-sub">${kpis.unassigned_attacks_count} não associados</div>` : ""}
          </div>

          <div class="kpi-card" onclick="window.switchTab('combos')">
            <div class="kpi-icon">🔗</div>
            <div class="kpi-number">${kpis.combos_count}</div>
            <div class="kpi-label">Combos Cadastrados</div>
            <div class="kpi-sub">${kpis.user_combos_count} criados • ${kpis.ai_combos_count} descobertos</div>
          </div>

          <div class="kpi-card" onclick="window.switchTab('analyses')">
            <div class="kpi-icon">📊</div>
            <div class="kpi-number">${kpis.analyses_count}</div>
            <div class="kpi-label">Análises de Combate</div>
            ${kpis.mechanical_issues_count > 0 ? `<div class="kpi-sub warning">${kpis.mechanical_issues_count} alertas mecânicos</div>` : ""}
          </div>
        </div>

        <!-- Two Column Overview Content -->
        <div class="overview-columns">
          <div class="overview-col">
            <div class="card">
              <h3>⚡ Ações Rápidas</h3>
              <div class="quick-actions-row">
                <button class="btn btn-secondary" onclick="window.switchTab('combos')">
                  ➕ Novo Combo
                </button>
                <button class="btn btn-secondary" onclick="window.switchTab('characters')">
                  👤 Ver Personagens
                </button>
                <button class="btn btn-secondary" onclick="window.switchTab('import')">
                  📥 Importar Dados Unity
                </button>
                <button class="btn btn-secondary" onclick="window.triggerDirectorAnalysis()">
                  🤖 Pedir Análise ao Diretor
                </button>
              </div>
            </div>

            <div class="card">
              <h3>📜 Atividades Recentes</h3>
              <div class="activity-feed">
                ${activityListHtml}
              </div>
            </div>
          </div>

          <div class="overview-col">
            <div class="card">
              <h3>💡 Recomendações do Combat Director</h3>
              <div class="recommendations-container">
                ${recsListHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}
