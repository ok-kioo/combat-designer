import type {
  RefreshToken,
  RefreshTokenRepositoryPort,
  User,
  UserRepositoryPort,
} from "../../../modules/auth/index.js";
import type { PostgresDatabase } from "./database.js";

export class PostgresUserRepository implements UserRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findById(id: string): Promise<User | null> {
    const res = await this.db.query<User>("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] ?? null;
  }

  public async findByUsername(username: string): Promise<User | null> {
    const res = await this.db.query<User>("SELECT * FROM users WHERE lower(username) = lower($1)", [username.trim()]);
    return res.rows[0] ?? null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const res = await this.db.query<User>("SELECT * FROM users WHERE lower(email) = lower($1)", [email.trim()]);
    return res.rows[0] ?? null;
  }

  public async save(user: User): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, username, password_hash, display_name, email, status, created_at, updated_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         email = EXCLUDED.email,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at,
         last_login_at = EXCLUDED.last_login_at`,
      [
        user.id,
        user.username,
        user.password_hash,
        user.display_name,
        user.email ?? null,
        user.status,
        user.created_at,
        user.updated_at,
        user.last_login_at ?? null,
      ]
    );
  }

  public async updateLastLogin(id: string, timestamp: string): Promise<void> {
    await this.db.query("UPDATE users SET last_login_at = $2, updated_at = $2 WHERE id = $1", [id, timestamp]);
  }

  public async updatePasswordHash(id: string, newHash: string): Promise<void> {
    await this.db.query("UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1", [
      id,
      newHash,
      new Date().toISOString(),
    ]);
  }
}

export class PostgresRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async save(token: RefreshToken): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, issued_at, expires_at, revoked_at, replaced_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         token_hash = EXCLUDED.token_hash,
         expires_at = EXCLUDED.expires_at,
         revoked_at = EXCLUDED.revoked_at,
         replaced_by = EXCLUDED.replaced_by`,
      [
        token.id,
        token.user_id,
        token.token_hash,
        token.issued_at,
        token.expires_at,
        token.revoked_at ?? null,
        token.replaced_by ?? null,
      ]
    );
  }

  public async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const res = await this.db.query<RefreshToken>("SELECT * FROM refresh_tokens WHERE token_hash = $1", [tokenHash]);
    return res.rows[0] ?? null;
  }

  public async revokeFamily(userId: string): Promise<void> {
    await this.db.query("UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", [
      userId,
      new Date().toISOString(),
    ]);
  }

  public async markRevoked(id: string, replacedBy?: string): Promise<void> {
    await this.db.query("UPDATE refresh_tokens SET revoked_at = $2, replaced_by = $3 WHERE id = $1", [
      id,
      new Date().toISOString(),
      replacedBy ?? null,
    ]);
  }
}
