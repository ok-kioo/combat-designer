import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { RegisterCredentials, UserProfile, AuthTokens } from "../types/index.js";

export interface RegisterFormProps {
  apiClient?: ApiClient;
  onSuccess?: (user: UserProfile, tokens: AuthTokens) => void;
  onSwitchToLogin?: () => void;
}

export interface RegisterFormState {
  username: string;
  password: string;
  displayName: string;
  isLoading: boolean;
  error?: string;
  showPassword?: boolean;
  passwordValidation: {
    minLength: boolean;
    hasUppercase: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

export class RegisterFormController {
  private readonly apiClient: ApiClient;
  private state: RegisterFormState;
  private onSuccess?: (user: UserProfile, tokens: AuthTokens) => void;
  private onSwitchToLogin?: () => void;

  constructor(props: RegisterFormProps = {}) {
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.onSuccess = props.onSuccess;
    this.onSwitchToLogin = props.onSwitchToLogin;
    this.state = {
      username: "",
      password: "",
      displayName: "",
      isLoading: false,
      showPassword: false,
      passwordValidation: {
        minLength: false,
        hasUppercase: false,
        hasNumber: false,
        hasSymbol: false,
      },
    };
  }

  public togglePasswordVisibility(): void {
    this.state.showPassword = !this.state.showPassword;
  }

  public setFormData(data: Partial<RegisterCredentials>): void {
    if (data.username !== undefined) {
      this.state.username = data.username.trim();
    }
    if (data.display_name !== undefined) {
      this.state.displayName = data.display_name.trim();
    }
    if (data.password !== undefined) {
      this.state.password = data.password;
      this.validatePassword(data.password);
    }
  }

  private validatePassword(password: string): void {
    this.state.passwordValidation = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSymbol: /[^A-Za-z0-9]/.test(password),
    };
  }

  public getState(): RegisterFormState {
    return { ...this.state };
  }

  public isPasswordValid(): boolean {
    const v = this.state.passwordValidation;
    return v.minLength && v.hasUppercase && v.hasNumber && v.hasSymbol;
  }

  public async submit(): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    if (!this.state.username) {
      this.state.error = "Nome de usuário é obrigatório.";
      throw new Error(this.state.error);
    }
    if (this.state.username.length < 3) {
      this.state.error = "Nome de usuário deve ter no mínimo 3 caracteres.";
      throw new Error(this.state.error);
    }
    if (!this.state.password) {
      this.state.error = "Senha é obrigatória.";
      throw new Error(this.state.error);
    }
    if (!this.isPasswordValid()) {
      this.state.error =
        "A senha deve ter no mínimo 8 caracteres, incluindo uma letra maiúscula, um número e um caractere especial.";
      throw new Error(this.state.error);
    }

    this.state.isLoading = true;
    this.state.error = undefined;

    try {
      const res = await fetch(`${this.apiClient.getBaseUrl()}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.state.username,
          password: this.state.password,
          display_name: this.state.displayName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          res.status === 409
            ? "Este nome de usuário já está em uso. Escolha outro."
            : data.message || "Falha ao realizar cadastro.";
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

      if (this.onSuccess) {
        this.onSuccess(user, tokens);
      }

      return { user, tokens };
    } catch (err: any) {
      this.state.isLoading = false;
      if (!this.state.error) {
        this.state.error = err?.message || "Erro de conexão ao efetuar cadastro.";
      }
      throw err;
    }
  }

  public renderModel() {
    return {
      username: this.state.username,
      displayName: this.state.displayName,
      isLoading: this.state.isLoading,
      error: this.state.error,
      showPassword: Boolean(this.state.showPassword),
      passwordValidation: this.state.passwordValidation,
      isPasswordValid: this.isPasswordValid(),
      canSubmit: Boolean(this.state.username && this.isPasswordValid() && !this.state.isLoading),
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const pv = model.passwordValidation;

    return `
      <div class="auth-form-card" id="register-form-container">
        <div class="auth-form-header">
          <h3>Criar Conta no Combat Designer</h3>
          <p class="auth-subtitle">Cadastre seu usuário para criar projetos e importar ataques da Unity.</p>
        </div>

        ${model.error ? `<div class="alert alert-error" id="register-error">${model.error}</div>` : ""}

        <form class="auth-form" onsubmit="event.preventDefault(); submitRegister();">
          <div class="form-group">
            <label for="reg-username">Nome de Usuário *</label>
            <input
              type="text"
              id="reg-username"
              class="form-control"
              placeholder="Ex: designer_pro"
              value="${model.username}"
              required
              autocomplete="username"
            />
          </div>

          <div class="form-group">
            <label for="reg-display-name">Nome de Exibição (Opcional)</label>
            <input
              type="text"
              id="reg-display-name"
              class="form-control"
              placeholder="Ex: Alex Combat Designer"
              value="${model.displayName}"
              autocomplete="name"
            />
          </div>

          <div class="form-group">
            <label for="reg-password">Senha *</label>
            <div class="password-input-wrapper" style="position: relative; display: flex; align-items: center;">
              <input
                type="${model.showPassword ? "text" : "password"}"
                id="reg-password"
                class="form-control"
                placeholder="Mínimo 8 caracteres, maiúscula, número e símbolo"
                required
                autocomplete="new-password"
                oninput="onPasswordInput(this.value)"
                style="padding-right: 42px;"
              />
              <button
                type="button"
                class="toggle-password-btn"
                onclick="togglePasswordVisibility('reg-password', this)"
                title="${model.showPassword ? "Ocultar Senha" : "Mostrar Senha"}"
                aria-label="${model.showPassword ? "Ocultar Senha" : "Mostrar Senha"}"
                style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; font-size: 1.1rem;"
              >
                ${model.showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          <div class="password-requirements">
            <div class="req-item ${pv.minLength ? "met" : ""}">
              <span class="req-icon">${pv.minLength ? "✓" : "○"}</span> Mínimo 8 caracteres
            </div>
            <div class="req-item ${pv.hasUppercase ? "met" : ""}">
              <span class="req-icon">${pv.hasUppercase ? "✓" : "○"}</span> Pelo menos 1 letra maiúscula
            </div>
            <div class="req-item ${pv.hasNumber ? "met" : ""}">
              <span class="req-icon">${pv.hasNumber ? "✓" : "○"}</span> Pelo menos 1 número
            </div>
            <div class="req-item ${pv.hasSymbol ? "met" : ""}">
              <span class="req-icon">${pv.hasSymbol ? "✓" : "○"}</span> Pelo menos 1 caractere especial (!@#$%)
            </div>
          </div>

          <button
            type="submit"
            class="btn btn-primary btn-block"
            id="btn-submit-register"
            ${model.isLoading ? "disabled" : ""}
          >
            ${model.isLoading ? "Criando Conta..." : "Criar Conta e Entrar"}
          </button>
        </form>

        <div class="auth-footer">
          <span>Já tem uma conta?</span>
          <button type="button" class="btn-link" id="btn-toggle-login" onclick="switchAuthTab('login')">
            Fazer login
          </button>
        </div>
      </div>
    `;
  }
}
