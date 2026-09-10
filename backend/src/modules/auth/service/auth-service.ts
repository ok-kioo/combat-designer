import crypto from "node:crypto";
import type {
  User,
  UserPublic,
  AuthTokens,
  AccessTokenClaims,
  WorkspaceMembership,
  RefreshToken,
} from "../domain/entity/auth.entity.js";
import type {
  UserRepositoryPort,
  WorkspaceMembershipRepositoryPort,
  RefreshTokenRepositoryPort,
} from "../domain/repository/auth-repository-ports.js";
import { hashPassword, verifyPassword } from "./password-hasher.js";
import { TokenService, DEFAULT_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_REFRESH_TOKEN_TTL_DAYS } from "./token-service.js";

export interface RegisterInput {
  email: string;
  password: string;
  display_name: string;
  initialWorkspaceId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  private readonly userRepo: UserRepositoryPort;
  private readonly membershipRepo: WorkspaceMembershipRepositoryPort;
  private readonly tokenRepo: RefreshTokenRepositoryPort;
  private readonly tokenService: TokenService;

  constructor(
    userRepo: UserRepositoryPort,
    membershipRepo: WorkspaceMembershipRepositoryPort,
    tokenRepo: RefreshTokenRepositoryPort,
    tokenService: TokenService = new TokenService()
  ) {
    this.userRepo = userRepo;
    this.membershipRepo = membershipRepo;
    this.tokenRepo = tokenRepo;
    this.tokenService = tokenService;
  }

  public async register(input: RegisterInput): Promise<{
    user: UserPublic;
    tokens: AuthTokens;
    workspace_id: string;
  }> {
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("INVALID_INPUT: A valid email address is required");
    }
    if (!input.password || input.password.length < 8) {
      throw new Error("INVALID_INPUT: Password must be at least 8 characters");
    }
    const displayName = input.display_name?.trim() || email.split("@")[0];

    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error("EMAIL_ALREADY_EXISTS: An account with this email already exists");
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(input.password);

    const user: User = {
      id: userId,
      email,
      password_hash: passwordHash,
      display_name: displayName,
      status: "active",
      created_at: now,
      last_login_at: now,
    };
    await this.userRepo.save(user);

    // Initial workspace creation & owner membership
    const workspaceId = input.initialWorkspaceId || `ws-${userId.substring(0, 8)}`;
    const membership: WorkspaceMembership = {
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      added_at: now,
    };
    await this.membershipRepo.save(membership);

    // Issue tokens
    const tokens = await this.createTokensForUser(user, [membership]);

    const publicUser: UserPublic = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      status: user.status,
      created_at: user.created_at,
    };

    return {
      user: publicUser,
      tokens,
      workspace_id: workspaceId,
    };
  }

  public async login(input: LoginInput): Promise<{ user: UserPublic; tokens: AuthTokens }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);

    // Generic error message to prevent user enumeration
    if (!user || user.status !== "active") {
      throw new Error("INVALID_CREDENTIALS: Incorrect email or password");
    }

    const passwordValid = verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      throw new Error("INVALID_CREDENTIALS: Incorrect email or password");
    }

    const now = new Date().toISOString();
    await this.userRepo.updateLastLogin(user.id, now);

    const memberships = await this.membershipRepo.findByUser(user.id);
    const tokens = await this.createTokensForUser(user, memberships);

    const publicUser: UserPublic = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      status: user.status,
      created_at: user.created_at,
    };

    return { user: publicUser, tokens };
  }

  public async refresh(refreshTokenString: string): Promise<AuthTokens> {
    if (!refreshTokenString || typeof refreshTokenString !== "string") {
      throw new Error("INVALID_REFRESH_TOKEN: Missing refresh token");
    }

    const hash = this.tokenService.hashRefreshToken(refreshTokenString);
    const record = await this.tokenRepo.findByTokenHash(hash);

    if (!record) {
      throw new Error("INVALID_REFRESH_TOKEN: Token not recognized");
    }

    // Reuse detection: if a revoked refresh token is presented, revoke all tokens for this user
    if (record.revoked_at) {
      await this.tokenRepo.revokeFamily(record.user_id);
      throw new Error("REVOKED_REFRESH_TOKEN: Reused token detected, token family revoked for security");
    }

    const now = new Date();
    if (new Date(record.expires_at) < now) {
      throw new Error("REFRESH_TOKEN_EXPIRED: Refresh token has expired");
    }

    const user = await this.userRepo.findById(record.user_id);
    if (!user || user.status !== "active") {
      throw new Error("USER_DISABLED: User account is disabled or inactive");
    }

    // Generate new refresh token pair (rotation)
    const { token: newOpaqueToken, hash: newHash } = this.tokenService.generateRefreshToken();
    const newTokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const newRecord: RefreshToken = {
      id: newTokenId,
      user_id: user.id,
      token_hash: newHash,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_at: null,
      replaced_by: null,
    };

    // Mark current token revoked with replacement pointer
    await this.tokenRepo.markRevoked(record.id, newTokenId);
    await this.tokenRepo.save(newRecord);

    const memberships = await this.membershipRepo.findByUser(user.id);
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      display_name: user.display_name,
      workspaces: memberships.map((m) => ({
        workspace_id: m.workspace_id,
        role: m.role,
      })),
    });

    return {
      access_token: accessToken,
      refresh_token: newOpaqueToken,
      token_type: "Bearer",
      expires_in: DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  public async logout(refreshTokenString: string): Promise<void> {
    if (!refreshTokenString) return;
    const hash = this.tokenService.hashRefreshToken(refreshTokenString);
    const record = await this.tokenRepo.findByTokenHash(hash);
    if (record && !record.revoked_at) {
      await this.tokenRepo.markRevoked(record.id);
    }
  }

  public verifyAccessToken(token: string): AccessTokenClaims {
    return this.tokenService.verifyAccessToken(token);
  }

  public async isUserAuthorizedForWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.membershipRepo.findByWorkspaceAndUser(workspaceId, userId);
    return membership !== null;
  }

  public async getMemberships(userId: string): Promise<WorkspaceMembership[]> {
    return this.membershipRepo.findByUser(userId);
  }

  public getTokenService(): TokenService {
    return this.tokenService;
  }

  private async createTokensForUser(user: User, memberships: WorkspaceMembership[]): Promise<AuthTokens> {
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      display_name: user.display_name,
      workspaces: memberships.map((m) => ({
        workspace_id: m.workspace_id,
        role: m.role,
      })),
    });

    const { token: opaqueRefreshToken, hash } = this.tokenService.generateRefreshToken();
    const expiresAt = new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const refreshTokenRecord: RefreshToken = {
      id: crypto.randomUUID(),
      user_id: user.id,
      token_hash: hash,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_at: null,
      replaced_by: null,
    };
    await this.tokenRepo.save(refreshTokenRecord);

    return {
      access_token: accessToken,
      refresh_token: opaqueRefreshToken,
      token_type: "Bearer",
      expires_in: DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
    };
  }
}
