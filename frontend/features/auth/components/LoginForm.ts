import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { LoginCredentials, UserProfile, AuthTokens } from "../types/index.js";

export interface LoginFormProps {
  apiClient?: ApiClient;
  onSuccess?: (user: UserProfile, tokens: AuthTokens) => void;
  onSwitchToRegister?: () => void;
}

export interface LoginFormState {
  username: string;
  password: string;
  isLoading: boolean;
  error?: string;
  successMessage?: string;
  showPassword?: boolean;
}

export class LoginFormController {
  private readonly apiClient: ApiClient;
  private state: LoginFormState;
  private onSuccess?: (user: UserProfile, tokens: AuthTokens) => void;
  private onSwitchToRegister?: () => void;

  constructor(props: LoginFormProps = {}) {
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.onSuccess = props.onSuccess;
    this.onSwitchToRegister = props.onSwitchToRegister;
    this.state = {
      username: "",
      password: "",
      isLoading: false,
      showPassword: false,
    };
  }

  public togglePasswordVisibility(): void {
    this.state.showPassword = !this.state.showPassword;
  }

  public setCredentials(credentials: Partial<LoginCredentials>): void {
    if (credentials.username !== undefined) {
      this.state.username = credentials.username.trim();
    }
    if (credentials.password !== undefined) {
      this.state.password = credentials.password;
    }
  }

  public getState(): LoginFormState {
    return { ...this.state };
  }

  public async submit(): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    if (!this.state.username) {
      this.state.error = "Informe o nome de usuário.";
      throw new Error(this.state.error);
    }
    if (!this.state.password) {
      this.state.error = "Informe a senha.";
      throw new Error(this.state.error);
    }

    this.state.isLoading = true;
    this.state.error = undefined;

    try {
      const res = await fetch(`${this.apiClient.getBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.state.username,
          password: this.state.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          res.status === 401
            ? "Usuário ou senha incorretos."
            : res.status === 429
            ? "Muitas tentativas. Tente novamente mais tarde."
            : data.message || "Falha ao realizar login.";
        this.state.error = errorMsg;
        this.state.isLoading = false;
        throw new Error(errorMsg);
      }

      const tokens: AuthTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
      const user: UserProfile = data.user;

      this.apiClient.setAuthToken(tokens.access_token);
      this.state.isLoading = false;
      this.state.successMessage = `Bem-vindo(a), ${user.display_name || user.username}!`;

      if (this.onSuccess) {
        this.onSuccess(user, tokens);
      }

      return { user, tokens };
    } catch (err: any) {
      this.state.isLoading = false;
      if (!this.state.error) {
        this.state.error = err?.message || "Erro de conexão ao efetuar login.";
      }
      throw err;
    }
  }

  public renderModel() {
    return {
      username: this.state.username,
      isLoading: this.state.isLoading,
      error: this.state.error,
      showPassword: Boolean(this.state.showPassword),
      canSubmit: Boolean(this.state.username && this.state.password && !this.state.isLoading),
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    return `
      <div class="auth-form-card" id="login-form-container">
        <div class="auth-form-header">
          <h3>Entrar no Combat Designer</h3>
          <p class="auth-subtitle">Acesse seus projetos de combate e importe dados da sua engine.</p>
        </div>

        ${model.error ? `<div class="alert alert-error" id="login-error">${model.error}</div>` : ""}

        <form class="auth-form" onsubmit="event.preventDefault(); submitLogin();">
          <div class="form-group">
            <label for="login-username">Nome de Usuário</label>
            <input
              type="text"
              id="login-username"
              class="form-control"
              placeholder="Ex: combat_designer"
              value="${model.username}"
              required
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label for="login-password">Senha</label>
            <div class="password-input-wrapper" style="position: relative; display: flex; align-items: center;">
              <input
                type="${model.showPassword ? "text" : "password"}"
                id="login-password"
                class="form-control"
                placeholder="Digite sua senha"
                required
                autocomplete="current-password"
                style="padding-right: 42px;"
              />
              <button
                type="button"
                class="toggle-password-btn"
                onclick="togglePasswordVisibility('login-password', this)"
                title="${model.showPassword ? "Ocultar Senha" : "Mostrar Senha"}"
                aria-label="${model.showPassword ? "Ocultar Senha" : "Mostrar Senha"}"
                style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; font-size: 1.1rem;"
              >
                ${model.showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-block"
            id="btn-submit-login"
            ${model.isLoading ? "disabled" : ""}
          >
            ${model.isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div class="auth-footer">
          <span>Não tem uma conta?</span>
          <button type="button" class="btn-link" id="btn-toggle-register" onclick="switchAuthTab('register')">
            Cadastre-se aqui
          </button>
        </div>
      </div>
    `;
  }
}
