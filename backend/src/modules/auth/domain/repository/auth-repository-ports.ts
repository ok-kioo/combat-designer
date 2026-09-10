import type { User, WorkspaceMembership, RefreshToken } from "../entity/auth.entity.js";

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  updateLastLogin(id: string, timestamp: string): Promise<void>;
}

export interface WorkspaceMembershipRepositoryPort {
  findByUser(userId: string): Promise<WorkspaceMembership[]>;
  findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;
  save(membership: WorkspaceMembership): Promise<void>;
  listMembers(workspaceId: string): Promise<WorkspaceMembership[]>;
}

export interface RefreshTokenRepositoryPort {
  save(token: RefreshToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revokeFamily(userId: string): Promise<void>;
  markRevoked(id: string, replacedBy?: string): Promise<void>;
}
