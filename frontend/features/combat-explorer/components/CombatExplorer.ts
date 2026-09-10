import { ProjectPanelController, type ProjectPanelProps } from "../../project-workspace/components/ProjectPanel.js";
import { DirectorChatController, type DirectorChatProps } from "../../director-chat/components/DirectorChat.js";
import { AttackCatalogController, type AttackCatalogProps } from "../../catalog/components/AttackCatalog.js";
import { SimulationWorkbenchController, type SimulationWorkbenchProps } from "../../simulation-workbench/components/SimulationWorkbench.js";
import { ChangeSetReviewController, type ChangeSetReviewProps } from "../../changeset-review/components/ChangeSetReview.js";
import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";

export type ActiveExplorerTab = "explorer" | "catalog" | "workbench" | "changesets";

export interface CombatExplorerConfig {
  workspaceId: string;
  apiClient?: ApiClient;
  initialTab?: ActiveExplorerTab;
  projectPanelProps?: Partial<ProjectPanelProps>;
  directorChatProps?: Partial<DirectorChatProps>;
  catalogProps?: Partial<AttackCatalogProps>;
  workbenchProps?: Partial<SimulationWorkbenchProps>;
  changesetReviewProps?: Partial<ChangeSetReviewProps>;
}

export class CombatExplorerController {
  public readonly workspaceId: string;
  public readonly apiClient: ApiClient;
  public activeTab: ActiveExplorerTab;

  public readonly projectPanel: ProjectPanelController;
  public readonly directorChat: DirectorChatController;
  public readonly catalog: AttackCatalogController;
  public readonly workbench: SimulationWorkbenchController;
  public readonly changesetReview: ChangeSetReviewController;

  constructor(config: CombatExplorerConfig) {
    this.workspaceId = config.workspaceId;
    this.apiClient = config.apiClient ?? defaultApiClient;
    this.activeTab = config.initialTab ?? "explorer";

    this.projectPanel = new ProjectPanelController({
      workspaceId: config.workspaceId,
      ...config.projectPanelProps,
    });

    this.directorChat = new DirectorChatController({
      workspaceId: config.workspaceId,
      apiClient: this.apiClient,
      ...config.directorChatProps,
    });

    this.catalog = new AttackCatalogController({
      workspaceId: config.workspaceId,
      apiClient: this.apiClient,
      onSelectionChange: (selectedIds) => {
        this.directorChat.setSelectedAttacks(selectedIds);
      },
      ...config.catalogProps,
    });

    this.workbench = new SimulationWorkbenchController({
      workspaceId: config.workspaceId,
      apiClient: this.apiClient,
      ...config.workbenchProps,
    });

    this.changesetReview = new ChangeSetReviewController({
      workspaceId: config.workspaceId,
      apiClient: this.apiClient,
      ...config.changesetReviewProps,
    });
  }

  public switchTab(tab: ActiveExplorerTab): void {
    this.activeTab = tab;
  }

  public renderLayout() {
    return {
      layout: "two-column" as const,
      workspaceId: this.workspaceId,
      activeTab: this.activeTab,
      leftColumn: {
        name: this.activeTab === "explorer" ? "ProjectPanel" : this.activeTab,
        activeTab: this.activeTab,
        data:
          this.activeTab === "explorer"
            ? this.projectPanel.renderModel()
            : this.activeTab === "catalog"
            ? this.catalog.renderModel()
            : this.activeTab === "workbench"
            ? this.workbench.renderModel()
            : this.changesetReview.renderModel(),
      },
      rightColumn: {
        name: "DirectorChat",
        data: this.directorChat.renderModel(),
      },
    };
  }

  public renderHtml(): string {
    const layout = this.renderLayout();
    const navTabs: Array<{ id: ActiveExplorerTab; label: string }> = [
      { id: "explorer", label: "1. Explorer" },
      { id: "catalog", label: "2. Attack Catalog" },
      { id: "workbench", label: "3. Simulation & Gate" },
      { id: "changesets", label: "4. ChangeSet Review" },
    ];

    const navHtml = navTabs
      .map(
        (t) => `
        <button class="nav-tab ${layout.activeTab === t.id ? "active" : ""}" data-tab="${t.id}">
          ${t.label}
        </button>`
      )
      .join("\n");

    let leftContentHtml = "";
    if (layout.activeTab === "explorer") {
      leftContentHtml = `<div class="panel-container">${JSON.stringify(layout.leftColumn.data)}</div>`;
    } else if (layout.activeTab === "catalog") {
      leftContentHtml = this.catalog.renderHtml();
    } else if (layout.activeTab === "workbench") {
      leftContentHtml = this.workbench.renderHtml();
    } else if (layout.activeTab === "changesets") {
      leftContentHtml = this.changesetReview.renderHtml();
    }

    const rightContentHtml = this.directorChat.renderHtml();

    return `
      <div class="combat-explorer-app" data-workspace="${layout.workspaceId}">
        <header class="app-header">
          <div class="header-branding">
            <h1>⚔️ Combat Designer</h1>
            <span class="workspace-badge">Workspace: <strong>${layout.workspaceId}</strong></span>
          </div>
          <nav class="app-nav">
            ${navHtml}
          </nav>
        </header>

        <main class="app-main two-column-layout">
          <div class="column left-column">
            ${leftContentHtml}
          </div>
          <div class="column right-column">
            ${rightContentHtml}
          </div>
        </main>
      </div>
    `;
  }
}
