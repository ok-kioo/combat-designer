export interface ApiClientConfig {
  baseUrl?: string;
  defaultAuthorizedWorkspaces?: string[];
  authToken?: string;
  refreshToken?: string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly defaultAuthorizedWorkspaces: string[];
  private authToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? "";
    this.defaultAuthorizedWorkspaces = config.defaultAuthorizedWorkspaces ?? [];
    this.authToken = config.authToken ?? null;
    this.refreshToken = config.refreshToken ?? null;
  }

  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public setRefreshToken(token: string | null): void {
    this.refreshToken = token;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private getHeaders(workspaceId?: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (workspaceId) {
      const authWorkspaces = this.defaultAuthorizedWorkspaces.length > 0
        ? this.defaultAuthorizedWorkspaces.join(",")
        : workspaceId;
      headers["x-authorized-workspaces"] = authWorkspaces;
    } else if (this.defaultAuthorizedWorkspaces.length > 0) {
      headers["x-authorized-workspaces"] = this.defaultAuthorizedWorkspaces.join(",");
    }

    return headers;
  }

  public async login(credentials: { email: string; password: string }): Promise<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    user: any;
    workspace_ids: string[];
  }> {
    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Login failed`);
    this.authToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  public async register(payload: {
    email: string;
    password: string;
    name: string;
    workspace_id?: string;
    role?: string;
  }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Registration failed`);
    if (data.access_token) {
      this.authToken = data.access_token;
      this.refreshToken = data.refresh_token;
    }
    return data;
  }

  public async refreshTokens(refreshToken?: string): Promise<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  }> {
    const tokenToUse = refreshToken ?? this.refreshToken;
    if (!tokenToUse) throw new Error("No refresh token available");
    const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenToUse }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Token refresh failed`);
    this.authToken = data.access_token;
    this.refreshToken = data.refresh_token;
    return data;
  }

  public async logout(refreshToken?: string): Promise<{ success: boolean }> {
    const tokenToUse = refreshToken ?? this.refreshToken;
    const res = await fetch(`${this.baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: this.getHeaders(undefined),
      body: JSON.stringify({ refresh_token: tokenToUse }),
    });
    this.authToken = null;
    this.refreshToken = null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Logout failed`);
    return data;
  }

  public async getMe(): Promise<{ user: any; memberships: any[] }> {
    const res = await fetch(`${this.baseUrl}/api/auth/me`, {
      method: "GET",
      headers: this.getHeaders(undefined),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Failed to get user profile`);
    return data;
  }

  public async getStatus(workspaceId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/status`, {
      method: "GET",
      headers: this.getHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to get workspace status`);
    return res.json();
  }

  public async uploadBundle(
    workspaceId: string,
    bundleData: { manifest: any; files: Record<string, string> }
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/bundles`, {
      method: "POST",
      headers: this.getHeaders(workspaceId),
      body: JSON.stringify(bundleData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.message || `HTTP ${res.status}: Bundle upload failed`);
    return data;
  }

  public async getAttacks(
    workspaceId: string,
    filter?: { query?: string; tag?: string; min_cancel_window?: number }
  ): Promise<{ count: number; attacks: any[] }> {
    const params = new URLSearchParams();
    if (filter?.query) params.set("query", filter.query);
    if (filter?.tag) params.set("tag", filter.tag);
    if (filter?.min_cancel_window !== undefined) params.set("min_cancel_window", String(filter.min_cancel_window));

    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/attacks${qs}`, {
      method: "GET",
      headers: this.getHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch attacks`);
    return res.json();
  }

  public async getAttack(workspaceId: string, attackId: string): Promise<{ attack: any }> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/attacks/${encodeURIComponent(attackId)}`,
      {
        method: "GET",
        headers: this.getHeaders(workspaceId),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: Attack not found`);
    return res.json();
  }

  public async simulate(workspaceId: string, input: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/simulations`, {
      method: "POST",
      headers: this.getHeaders(workspaceId),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Simulation failed`);
    return res.json();
  }

  public async verify(workspaceId: string, verificationRequest: any, simulationOutput: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/verifications`, {
      method: "POST",
      headers: this.getHeaders(workspaceId),
      body: JSON.stringify({
        verification_request: verificationRequest,
        simulation_output: simulationOutput,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Verification failed`);
    return res.json();
  }

  public async getChangeSets(workspaceId: string): Promise<{ count: number; changesets: any[] }> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets`, {
      method: "GET",
      headers: this.getHeaders(workspaceId),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch changesets`);
    return res.json();
  }

  public async getChangeSet(workspaceId: string, changesetId: string): Promise<{ changeset: any }> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets/${encodeURIComponent(changesetId)}`,
      {
        method: "GET",
        headers: this.getHeaders(workspaceId),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ChangeSet not found`);
    return res.json();
  }

  public async proposeChangeSet(workspaceId: string, proposal: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets`, {
      method: "POST",
      headers: this.getHeaders(workspaceId),
      body: JSON.stringify(proposal),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Proposing changeset failed`);
    return data;
  }

  public async approveChangeSet(workspaceId: string, changesetId: string, approverId = "human_lead"): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets/${encodeURIComponent(changesetId)}/approve`,
      {
        method: "POST",
        headers: this.getHeaders(workspaceId),
        body: JSON.stringify({ approver_id: approverId }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Approving changeset failed`);
    return data;
  }

  public async applyChangeSet(workspaceId: string, changesetId: string, gateResult: any): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets/${encodeURIComponent(changesetId)}/apply`,
      {
        method: "POST",
        headers: this.getHeaders(workspaceId),
        body: JSON.stringify({ gate_result: gateResult }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Applying changeset failed`);
    return data;
  }

  public async withdrawChangeSet(workspaceId: string, changesetId: string, reason?: string): Promise<any> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/changesets/${encodeURIComponent(changesetId)}/withdraw`,
      {
        method: "POST",
        headers: this.getHeaders(workspaceId),
        body: JSON.stringify({ reason }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Withdrawing changeset failed`);
    return data;
  }

  public async sendChatMessage(
    workspaceId: string,
    prompt: string,
    context?: {
      snapshot_hash?: string;
      selected_attack_ids?: string[];
      active_changeset_id?: string;
    }
  ): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/chat`, {
      method: "POST",
      headers: this.getHeaders(workspaceId),
      body: JSON.stringify({ prompt, context }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}: Chat message failed`);
    return data;
  }
}

export const defaultApiClient = new ApiClient();
