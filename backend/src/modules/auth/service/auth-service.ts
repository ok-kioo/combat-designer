import crypto from "node:crypto";
import type {
  User,
  UserPublic,
  AuthTokens,
  AccessTokenClaims,
  RefreshToken,
} from "../domain/entity/auth.entity.js";
import type {
  UserRepositoryPort,
  RefreshTokenRepositoryPort,
} from "../domain/repository/auth-repository-ports.js";
import type { WorkspaceRepositoryPort } from "../../workspace/domain/repository/workspace-repository-port.js";
import { hashPassword, verifyPassword, needsRehash } from "./password-hasher.js";
import {
  TokenService,
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  DEFAULT_REFRESH_TOKEN_TTL_DAYS,
} from "./token-service.js";

export interface RegisterInput {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export class AuthService {
  private readonly userRepo: UserRepositoryPort;
  private readonly tokenRepo: RefreshTokenRepositoryPort;
  private readonly workspaceRepo?: WorkspaceRepositoryPort;
  private readonly tokenService: TokenService;

  constructor(
    userRepo: UserRepositoryPort,
    tokenRepo: RefreshTokenRepositoryPort,
    workspaceRepo?: WorkspaceRepositoryPort,
    tokenService: TokenService = new TokenService()
  ) {
    this.userRepo = userRepo;
    this.tokenRepo = tokenRepo;
    this.workspaceRepo = workspaceRepo;
    this.tokenService = tokenService;
  }

  /**
   * Registers a new user with Argon2id password hash and case-insensitive username.
   * Per Spec 12: Does not accept client-provided workspace IDs; projects are created separately.
   */
  public async register(input: RegisterInput): Promise<{
    user: UserPublic;
    tokens: AuthTokens;
  }> {
    if (!input.username || typeof input.username !== "string" || input.username.trim() === "") {
      throw new Error("INVALID_INPUT: A non-empty username is required");
    }
    const trimmedUsername = input.username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
      throw new Error("INVALID_INPUT: Username must be between 3 and 32 characters");
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUsername)) {
      throw new Error("INVALID_INPUT: Username may only contain alphanumeric characters, underscores, hyphens, and periods");
    }

    if (!input.password || typeof input.password !== "string" || input.password.length < 8) {
      throw new Error("INVALID_INPUT: Password must be at least 8 characters");
    }

    const existing = await this.userRepo.findByUsername(trimmedUsername);
    if (existing) {
      throw new Error("USERNAME_ALREADY_EXISTS: An account with this username already exists");
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(input.password);
    const displayName = input.display_name?.trim() || trimmedUsername;

    const user: User = {
      id: userId,
      username: trimmedUsername,
      password_hash: passwordHash,
      display_name: displayName,
      email: input.email?.trim(),
      status: "active",
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };
    await this.userRepo.save(user);

    // Issue tokens
    const tokens = await this.createTokensForUser(user);

    const publicUser: UserPublic = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return {
      user: publicUser,
      tokens,
    };
  }

  /**
   * Authenticates a user by username and password.
   * Checks exclusively username; provides generic error response to prevent user enumeration.
   * If user has a legacy PBKDF2 hash, migrates it to Argon2id upon successful verification.
   */
  public async login(input: LoginInput): Promise<{ user: UserPublic; tokens: AuthTokens }> {
    if (!input.username || typeof input.username !== "string" || !input.password) {
      throw new Error("INVALID_CREDENTIALS: Incorrect username or password");
    }

    const user = await this.userRepo.findByUsername(input.username.trim());

    // Generic error message to prevent user enumeration
    if (!user || user.status !== "active") {
      throw new Error("INVALID_CREDENTIALS: Incorrect username or password");
    }

    const passwordValid = await verifyPassword(input.password, user.password_hash);
    if (!passwordValid) {
      throw new Error("INVALID_CREDENTIALS: Incorrect username or password");
    }

    // Explicit migration: if stored hash was legacy PBKDF2, convert to Argon2id
    if (needsRehash(user.password_hash) && this.userRepo.updatePasswordHash) {
      try {
        const modernHash = await hashPassword(input.password);
        await this.userRepo.updatePasswordHash(user.id, modernHash);
      } catch {
        // Migration failure should not block successful login
      }
    }

    const now = new Date().toISOString();
    await this.userRepo.updateLastLogin(user.id, now);

    const tokens = await this.createTokensForUser(user);

    const publicUser: UserPublic = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return { user: publicUser, tokens };
  }

  /**
   * Rotates a refresh token and returns a new token pair.
   * Detects reuse of revoked tokens: revokes the entire token family if reuse is detected.
   */
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

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      username: user.username,
      display_name: user.display_name,
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

  /**
   * Derives authorization from Workspace.owner_user_id === authenticated_user.id.
   * Spec 12 Rule: No roles, memberships, or self-declared headers.
   */
  public async isUserAuthorizedForWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    if (!this.workspaceRepo) return false;
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) return false;
    return workspace.owner_user_id === userId;
  }

  public getTokenService(): TokenService {
    return this.tokenService;
  }

  private async createTokensForUser(user: User): Promise<AuthTokens> {
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      username: user.username,
      display_name: user.display_name,
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
