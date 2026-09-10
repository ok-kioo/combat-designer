import type {
  User,
  RefreshToken,
  UserRepositoryPort,
  RefreshTokenRepositoryPort,
} from "../../../modules/auth/index.js";

export const DEFAULT_DEV_USER_ID = "usr-developer-default";
export const DEFAULT_DEV_USERNAME = "developer";
export const DEFAULT_DEV_EMAIL = "developer@combatdesigner.io";
export const DEFAULT_DEV_PASSWORD = "CombatDesigner2026!";
export const DEFAULT_DEV_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$namF953jZQyO6WORSeo9LQ$ywkRij8Zfs7ZgLk8yZFu3+lMiYb0jLBffkbc1RRj64s";
export const DEFAULT_DEV_WORKSPACE_ID = "ws-default";

export class InMemoryUserRepository implements UserRepositoryPort {
  private readonly users = new Map<string, User>();

  constructor(seedDevUser = true) {
    if (seedDevUser) {
      const now = new Date().toISOString();
      const devUser: User = {
        id: DEFAULT_DEV_USER_ID,
        username: DEFAULT_DEV_USERNAME,
        password_hash: DEFAULT_DEV_PASSWORD_HASH,
        display_name: "Developer",
        email: DEFAULT_DEV_EMAIL,
        status: "active",
        created_at: now,
        updated_at: now,
        last_login_at: now,
      };
      this.users.set(devUser.id, devUser);
    }
  }

  public async findById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async findByUsername(username: string): Promise<User | null> {
    const normalized = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.trim().toLowerCase() === normalized) {
        return { ...user };
      }
    }
    return null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email && user.email.trim().toLowerCase() === normalized) {
        return { ...user };
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
      user.updated_at = timestamp;
    }
  }

  public async updatePasswordHash(id: string, newHash: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.password_hash = newHash;
      user.updated_at = new Date().toISOString();
    }
  }

  public clear(): void {
    this.users.clear();
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
    const token = this.tokensById.get(id);
    return token ? { ...token } : null;
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
