import type { User, RefreshToken } from "../entity/auth.entity.js";

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByEmail?(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  updateLastLogin(id: string, timestamp: string): Promise<void>;
  updatePasswordHash?(id: string, newHash: string): Promise<void>;
}

export interface RefreshTokenRepositoryPort {
  save(token: RefreshToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revokeFamily(userId: string): Promise<void>;
  markRevoked(id: string, replacedBy?: string): Promise<void>;
}
