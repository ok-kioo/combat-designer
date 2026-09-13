export interface WorkspaceDashboardItem {
  id: string;
  name: string;
  description?: string;
  engine?: string;
  engine_version?: string;
  status: "active" | "archived";
  characters_count?: number;
  attacks_count?: number;
  combos_count?: number;
  updated_at: string;
}

export interface WorkspaceDashboardProps {
  workspaces: WorkspaceDashboardItem[];
  currentWorkspaceId?: string;
  onOpenWorkspace?: (id: string) => void;
  onArchiveWorkspace?: (id: string) => void;
  onCreateWorkspace?: () => void;
}

export class WorkspaceDashboardController {
  constructor(private props: WorkspaceDashboardProps) {}

  public renderHtml(): string {
    const { workspaces } = this.props;

    const cardsHtml =
      workspaces.length === 0
        ? `
        <div class="empty-state-box">
          <div class="empty-icon">📁</div>
          <h3>Nenhum projeto encontrado</h3>
          <p>Crie seu primeiro projeto de combate para começar a modelar personagens e combos.</p>
          <button class="btn btn-success" onclick="window.openCreateWorkspaceModal()">➕ Criar Primeiro Projeto</button>
        </div>
      `
        : workspaces
            .map((ws) => {
              const isArchived = ws.status === "archived";
              return `
          <div class="workspace-card ${isArchived ? "archived" : ""}" data-id="${ws.id}">
            <div class="ws-card-header">
              <div class="ws-card-title-group">
                <h3 class="ws-card-name">${escapeHtml(ws.name)}</h3>
                <span class="badge ${isArchived ? "badge-warning" : "badge-live"}">
                  ${isArchived ? "Arquivado" : "Ativo"}
                </span>
              </div>
              <span class="ws-engine-tag">🎮 ${escapeHtml(ws.engine || "Unity")} ${escapeHtml(ws.engine_version || "")}</span>
            </div>

            <p class="ws-card-desc">${escapeHtml(ws.description || "Sem descrição informada.")}</p>

            <div class="ws-card-kpis">
              <div class="kpi-mini">
                <span class="kpi-val">${ws.characters_count ?? 0}</span>
                <span class="kpi-lbl">Personagens</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-val">${ws.attacks_count ?? 0}</span>
                <span class="kpi-lbl">Golpes</span>
              </div>
              <div class="kpi-mini">
                <span class="kpi-val">${ws.combos_count ?? 0}</span>
                <span class="kpi-lbl">Combos</span>
              </div>
            </div>

            <div class="ws-card-footer">
              <button class="btn btn-primary" onclick="window.selectAndOpenWorkspace('${ws.id}')">
                Abrir Workbench ➔
              </button>
              ${
                !isArchived
                  ? `<button class="btn btn-secondary btn-sm" onclick="window.confirmArchiveWorkspace('${ws.id}')" title="Arquivar este projeto">
                      📦 Arquivar
                    </button>`
                  : ""
              }
            </div>
          </div>
        `;
            })
            .join("\n");

    return `
      <div class="workspace-dashboard">
        <div class="dashboard-header">
          <div>
            <h2>Meus Projetos de Combate</h2>
            <p class="text-dim">Gerencie seus jogos, balanceamentos e regras de combate.</p>
          </div>
          <button class="btn btn-success" onclick="window.openCreateWorkspaceModal()">
            ➕ Novo Projeto
          </button>
        </div>

        <div class="workspaces-grid">
          ${cardsHtml}
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
