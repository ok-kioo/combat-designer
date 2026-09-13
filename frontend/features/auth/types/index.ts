export interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  email?: string;
  status?: string;
  created_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface WorkspaceSummaryView {
  id: string;
  name: string;
  owner_user_id: string;
  status?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: UserProfile;
  tokens?: AuthTokens;
  activeWorkspaceId: string;
  availableWorkspaces: WorkspaceSummaryView[];
  isLoading: boolean;
  error?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
}
