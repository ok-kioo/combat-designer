import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { UserProfile, WorkspaceSummaryView } from "../types/index.js";

export interface UserSessionBarProps {
  apiClient?: ApiClient;
  user?: UserProfile;
  activeWorkspaceId?: string;
  onWorkspaceChanged?: (workspaceId: string) => void;
  onLogout?: () => void;
}

export class UserSessionBarController {
  private readonly apiClient: ApiClient;
  private user?: UserProfile;
  private activeWorkspaceId: string;
  private workspaces: WorkspaceSummaryView[] = [];
  private onWorkspaceChanged?: (workspaceId: string) => void;
  private onLogout?: () => void;

  constructor(props: UserSessionBarProps = {}) {
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.user = props.user;
    this.activeWorkspaceId = props.activeWorkspaceId ?? "ws-default";
    this.onWorkspaceChanged = props.onWorkspaceChanged;
    this.onLogout = props.onLogout;
  }

  public setUser(user: UserProfile): void {
    this.user = user;
  }

  public setActiveWorkspaceId(workspaceId: string): void {
    this.activeWorkspaceId = workspaceId;
    if (this.onWorkspaceChanged) {
      this.onWorkspaceChanged(workspaceId);
    }
  }

  public getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  public setWorkspaces(workspaces: WorkspaceSummaryView[]): void {
    this.workspaces = workspaces;
    if (workspaces.length > 0 && !workspaces.some((w) => w.id === this.activeWorkspaceId)) {
      this.activeWorkspaceId = workspaces[0].id;
    }
  }

  public async loadUserWorkspaces(): Promise<WorkspaceSummaryView[]> {
    try {
      const res = await fetch(`${this.apiClient.getBaseUrl()}/api/workspaces`, {
        headers: {
          Authorization: `Bearer ${this.apiClient.getAuthToken()}`,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to load workspaces`);
      }

      const list: WorkspaceSummaryView[] = await res.json();
      this.setWorkspaces(list);
      return list;
    } catch (err) {
      console.warn("Could not load user workspaces:", err);
      return this.workspaces;
    }
  }

  public async createWorkspace(name: string, description?: string): Promise<WorkspaceSummaryView> {
    const res = await fetch(`${this.apiClient.getBaseUrl()}/api/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiClient.getAuthToken()}`,
      },
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}: Failed to create workspace`);
    }

    const created: WorkspaceSummaryView = await res.json();
    this.workspaces.push(created);
    this.setActiveWorkspaceId(created.id);
    return created;
  }

  public logout(): void {
    const token = this.apiClient.getAuthToken();
    if (token) {
      fetch(`${this.apiClient.getBaseUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    this.apiClient.clearAuthToken();
    this.user = undefined;
    this.workspaces = [];

    if (this.onLogout) {
      this.onLogout();
    }
  }

  public renderModel() {
    return {
      isAuthenticated: Boolean(this.user),
      username: this.user?.username ?? "",
      displayName: this.user?.display_name || this.user?.username || "",
      activeWorkspaceId: this.activeWorkspaceId,
      workspaces: this.workspaces,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();

    if (!model.isAuthenticated) {
      return `
        <div class="user-session-bar unauthenticated">
          <button class="btn btn-primary btn-sm" onclick="openAuthModal('login')">Entrar</button>
          <button class="btn btn-secondary btn-sm" onclick="openAuthModal('register')">Cadastrar</button>
        </div>
      `;
    }

    const wsOptions =
      model.workspaces.length > 0
        ? model.workspaces
            .map(
              (w) =>
                `<option value="${w.id}" ${w.id === model.activeWorkspaceId ? "selected" : ""}>${w.name || w.id}</option>`
            )
            .join("\n")
        : `<option value="${model.activeWorkspaceId}">${model.activeWorkspaceId}</option>`;

    return `
      <div class="user-session-bar authenticated" id="user-session-bar">
        <div class="workspace-picker">
          <label for="user-ws-select">Projeto Ativo:</label>
          <select id="user-ws-select" class="ws-select" onchange="onWorkspaceSelectChange(this.value)">
            ${wsOptions}
          </select>
          <button class="btn btn-secondary btn-sm" onclick="promptCreateWorkspace()" title="Criar Novo Projeto">
            ➕ Novo
          </button>
        </div>

        <div class="user-profile-badge">
          <span class="user-avatar">👤</span>
          <span class="user-name" id="session-user-name">${model.displayName}</span>
          <button class="btn btn-outline btn-sm btn-logout" id="btn-logout" onclick="performLogout()">
            Sair
          </button>
        </div>
      </div>
    `;
  }
}
