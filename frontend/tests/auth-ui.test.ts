import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LoginFormController } from "../features/auth/components/LoginForm.js";
import { RegisterFormController } from "../features/auth/components/RegisterForm.js";
import { UserSessionBarController } from "../features/auth/components/UserSessionBar.js";
import { ApiClient } from "../shared/services/api-client.js";

describe("SPEC 10 & 12 — Auth and Project UI (10.UI.9 - 10.UI.14)", () => {
  let apiClient: ApiClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    apiClient = new ApiClient("http://localhost:4000");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("10.UI.9: LoginFormController rejects empty credentials and reports validation error", async () => {
    const controller = new LoginFormController({ apiClient });

    await expect(controller.submit()).rejects.toThrow("Informe o nome de usuário.");
    expect(controller.getState().error).toBe("Informe o nome de usuário.");

    controller.setCredentials({ username: "player1" });
    await expect(controller.submit()).rejects.toThrow("Informe a senha.");
    expect(controller.getState().error).toBe("Informe a senha.");
  });

  it("10.UI.10: LoginFormController authenticates with valid username/password and sets access_token on ApiClient", async () => {
    const mockUser = {
      id: "u-123",
      username: "combat_lead",
      display_name: "Combat Lead",
      status: "active" as const,
      created_at: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "jwt-test-token-xyz",
        refresh_token: "jwt-refresh-token-xyz",
        user: mockUser,
      }),
    } as Response);

    const onSuccess = vi.fn();
    const controller = new LoginFormController({ apiClient, onSuccess });
    controller.setCredentials({ username: "combat_lead", password: "SecretPassword123!" });

    const result = await controller.submit();

    expect(result.tokens.access_token).toBe("jwt-test-token-xyz");
    expect(result.user.username).toBe("combat_lead");
    expect(apiClient.getAuthToken()).toBe("jwt-test-token-xyz");
    expect(onSuccess).toHaveBeenCalledWith(mockUser, {
      access_token: "jwt-test-token-xyz",
      refresh_token: "jwt-refresh-token-xyz",
    });

    const html = controller.renderHtml();
    expect(html).toContain("combat_lead");
  });

  it("10.UI.11: LoginFormController handles 401 Unauthorized with user-friendly error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid credentials" }),
    } as Response);

    const controller = new LoginFormController({ apiClient });
    controller.setCredentials({ username: "wrong_user", password: "bad_password" });

    await expect(controller.submit()).rejects.toThrow("Usuário ou senha incorretos.");
    expect(controller.getState().error).toBe("Usuário ou senha incorretos.");
    expect(controller.getState().isLoading).toBe(false);

    const html = controller.renderHtml();
    expect(html).toContain("Usuário ou senha incorretos.");
  });

  it("10.UI.12: RegisterFormController validates password complexity (min 8 chars, uppercase, digit, symbol)", async () => {
    const controller = new RegisterFormController({ apiClient });
    controller.setFormData({ username: "new_designer" });

    // Weak password: too short
    controller.setFormData({ password: "Ab1!" });
    expect(controller.isPasswordValid()).toBe(false);
    await expect(controller.submit()).rejects.toThrow(
      "A senha deve ter no mínimo 8 caracteres, incluindo uma letra maiúscula, um número e um caractere especial."
    );

    // No uppercase
    controller.setFormData({ password: "password123!" });
    expect(controller.isPasswordValid()).toBe(false);

    // No number
    controller.setFormData({ password: "Password!!!!" });
    expect(controller.isPasswordValid()).toBe(false);

    // No symbol
    controller.setFormData({ password: "Password1234" });
    expect(controller.isPasswordValid()).toBe(false);

    // Valid password
    controller.setFormData({ password: "StrongPassword123!" });
    expect(controller.isPasswordValid()).toBe(true);
    expect(controller.getState().passwordValidation).toEqual({
      minLength: true,
      hasUppercase: true,
      hasNumber: true,
      hasSymbol: true,
    });
  });

  it("10.UI.13: RegisterFormController successfully registers new user and invokes onSuccess callback", async () => {
    const mockUser = {
      id: "u-999",
      username: "brand_new_user",
      display_name: "Brand New User",
      status: "active" as const,
      created_at: new Date().toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        access_token: "reg-jwt-token-abc",
        refresh_token: "reg-refresh-token-abc",
        user: mockUser,
      }),
    } as Response);

    const onSuccess = vi.fn();
    const controller = new RegisterFormController({ apiClient, onSuccess });
    controller.setFormData({
      username: "brand_new_user",
      password: "CombatPassword2026!",
      display_name: "Brand New User",
    });

    const result = await controller.submit();
    expect(result.tokens.access_token).toBe("reg-jwt-token-abc");
    expect(result.user.username).toBe("brand_new_user");
    expect(apiClient.getAuthToken()).toBe("reg-jwt-token-abc");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("10.UI.14: UserSessionBarController loads user workspaces and switches active project", async () => {
    const userWorkspaces = [
      { id: "ws-project-alpha", name: "Alpha Fighter", owner_user_id: "u-123" },
      { id: "ws-project-beta", name: "Beta Brawler", owner_user_id: "u-123" },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => userWorkspaces,
    } as Response);

    const onWorkspaceChanged = vi.fn();
    const onLogout = vi.fn();

    const controller = new UserSessionBarController({
      apiClient,
      user: {
        id: "u-123",
        username: "lead_designer",
        display_name: "Lead Designer",
        status: "active",
        created_at: new Date().toISOString(),
      },
      activeWorkspaceId: "ws-project-alpha",
      onWorkspaceChanged,
      onLogout,
    });

    const list = await controller.loadUserWorkspaces();
    expect(list.length).toBe(2);
    expect(controller.getActiveWorkspaceId()).toBe("ws-project-alpha");

    controller.setActiveWorkspaceId("ws-project-beta");
    expect(controller.getActiveWorkspaceId()).toBe("ws-project-beta");
    expect(onWorkspaceChanged).toHaveBeenCalledWith("ws-project-beta");

    const html = controller.renderHtml();
    expect(html).toContain("Lead Designer");
    expect(html).toContain("Alpha Fighter");
    expect(html).toContain("Beta Brawler");

    controller.logout();
    expect(onLogout).toHaveBeenCalled();
  });

  it("10.UI.15: LoginFormController toggles password visibility state and updates rendered HTML", () => {
    const controller = new LoginFormController({ apiClient });
    expect(controller.getState().showPassword).toBe(false);
    expect(controller.renderHtml()).toContain('type="password"');

    controller.togglePasswordVisibility();
    expect(controller.getState().showPassword).toBe(true);
    expect(controller.renderHtml()).toContain('type="text"');

    controller.togglePasswordVisibility();
    expect(controller.getState().showPassword).toBe(false);
    expect(controller.renderHtml()).toContain('type="password"');
  });

  it("10.UI.16: RegisterFormController toggles password visibility state and updates rendered HTML", () => {
    const controller = new RegisterFormController({ apiClient });
    expect(controller.getState().showPassword).toBe(false);
    expect(controller.renderHtml()).toContain('type="password"');

    controller.togglePasswordVisibility();
    expect(controller.getState().showPassword).toBe(true);
    expect(controller.renderHtml()).toContain('type="text"');

    controller.togglePasswordVisibility();
    expect(controller.getState().showPassword).toBe(false);
    expect(controller.renderHtml()).toContain('type="password"');
  });
});
