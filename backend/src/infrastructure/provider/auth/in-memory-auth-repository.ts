import type {
  User,
  WorkspaceMembership,
  RefreshToken,
  UserRepositoryPort,
  WorkspaceMembershipRepositoryPort,
  RefreshTokenRepositoryPort,
} from "../../../modules/auth/index.js";
import { hashPassword } from "../../../modules/auth/service/password-hasher.js";

export const DEFAULT_DEV_USER_ID = "usr-developer-default";
export const DEFAULT_DEV_EMAIL = "developer@combatdesigner.io";
export const DEFAULT_DEV_PASSWORD = "CombatDesigner2026!";
export const DEFAULT_DEV_WORKSPACE_ID = "ws-default";

export class InMemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, User>();

  constructor(seedDevUser = true) {
    if (seedDevUser) {
      const now = new Date().toISOString();
      const devUser: User = {
        id: DEFAULT_DEV_USER_ID,
        email: DEFAULT_DEV_EMAIL,
        password_hash: hashPassword(DEFAULT_DEV_PASSWORD),
        display_name: "Combat Designer Developer",
        status: "active",
        created_at: now,
        last_login_at: now,
      };
      this.users.set(devUser.id, devUser);
    }
  }

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  public async save(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  public async updateLastLogin(id: string, timestamp: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.last_login_at = timestamp;
    }
  }

  public clear(): void {
    this.users.clear();
  }
}

export class InMemoryWorkspaceMembershipRepository implements WorkspaceMembershipRepositoryPort {
  private readonly memberships = new Map<string, WorkspaceMembership>();

  constructor(seedDevMembership = true) {
    if (seedDevMembership) {
      const now = new Date().toISOString();
      const seedWorkspaces = [DEFAULT_DEV_WORKSPACE_ID, "ws-test", "ws-tenant-a", "ws-tenant-b"];
      for (const wsId of seedWorkspaces) {
        const key = `${wsId}:${DEFAULT_DEV_USER_ID}`;
        this.memberships.set(key, {
          workspace_id: wsId,
          user_id: DEFAULT_DEV_USER_ID,
          role: "owner",
          added_at: now,
        });
      }
    }
  }

  public async findByUser(userId: string): Promise<WorkspaceMembership[]> {
    const results: WorkspaceMembership[] = [];
    for (const m of this.memberships.values()) {
      if (m.user_id === userId) {
        results.push({ ...m });
      }
    }
    return results;
  }

  public async findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    const key = `${workspaceId}:${userId}`;
    return this.memberships.get(key) ?? null;
  }

  public async save(membership: WorkspaceMembership): Promise<void> {
    const key = `${membership.workspace_id}:${membership.user_id}`;
    this.memberships.set(key, { ...membership });
  }

  public async listMembers(workspaceId: string): Promise<WorkspaceMembership[]> {
    const results: WorkspaceMembership[] = [];
    for (const m of this.memberships.values()) {
      if (m.workspace_id === workspaceId) {
        results.push({ ...m });
      }
    }
    return results;
  }

  public clear(): void {
    this.memberships.clear();
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepositoryPort {
  private readonly tokensById = new Map<string, RefreshToken>();
  private readonly tokensByHash = new Map<string, string>(); // token_hash -> id

  public async save(token: RefreshToken): Promise<void> {
    this.tokensById.set(token.id, { ...token });
    this.tokensByHash.set(token.token_hash, token.id);
  }

  public async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const id = this.tokensByHash.get(tokenHash);
    if (!id) return null;
    return this.tokensById.get(id) ?? null;
  }

  public async revokeFamily(userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const token of this.tokensById.values()) {
      if (token.user_id === userId && !token.revoked_at) {
        token.revoked_at = now;
      }
    }
  }

  public async markRevoked(id: string, replacedBy?: string): Promise<void> {
    const token = this.tokensById.get(id);
    if (token) {
      token.revoked_at = new Date().toISOString();
      if (replacedBy) {
        token.replaced_by = replacedBy;
      }
    }
  }

  public clear(): void {
    this.tokensById.clear();
    this.tokensByHash.clear();
  }
}
