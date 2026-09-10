import crypto from "node:crypto";
import argon2 from "argon2";

export interface Argon2Options {
  type?: 0 | 1 | 2;
  timeCost?: number;
  memoryCost?: number;
  parallelism?: number;
}

export const ARGON2_DEFAULT_OPTIONS: Argon2Options = {
  type: argon2.argon2id as 2,
  timeCost: 3,
  memoryCost: 65536, // 64 MB
  parallelism: 1,
};

// Legacy PBKDF2 parameters (for migration of existing legacy accounts only)
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

/**
 * Hashes a plain password using Argon2id with configurable security parameters.
 * Output format: `$argon2id$v=...`
 */
export async function hashPassword(
  password: string,
  options: Argon2Options = ARGON2_DEFAULT_OPTIONS
): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  return argon2.hash(password, {
    type: options.type ?? argon2.argon2id,
    timeCost: options.timeCost ?? ARGON2_DEFAULT_OPTIONS.timeCost,
    memoryCost: options.memoryCost ?? ARGON2_DEFAULT_OPTIONS.memoryCost,
    parallelism: options.parallelism ?? ARGON2_DEFAULT_OPTIONS.parallelism,
  });
}

/**
 * Verifies a plain password against the stored hash in constant time.
 * Supports Argon2id natively, and falls back to PBKDF2 only for legacy hash migration.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!password || !storedHash) {
    return false;
  }

  try {
    // 1. Argon2id check (all modern hashes start with $argon2)
    if (storedHash.startsWith("$argon2")) {
      return await argon2.verify(storedHash, password);
    }

    // 2. Legacy PBKDF2 check (salt:hexKey) solely for user migration
    if (storedHash.includes(":")) {
      const parts = storedHash.split(":");
      if (parts.length !== 2) {
        return false;
      }
      const [salt, expectedKeyHex] = parts;
      if (!salt || !expectedKeyHex) {
        return false;
      }
      const derivedKey = crypto.pbkdf2Sync(
        password,
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST
      );
      const expectedKey = Buffer.from(expectedKeyHex, "hex");
      if (derivedKey.length !== expectedKey.length) {
        return false;
      }
      return crypto.timingSafeEqual(derivedKey, expectedKey);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Indicates whether a stored hash is legacy (PBKDF2) and should be migrated to Argon2id.
 */
export function needsRehash(storedHash: string): boolean {
  return !storedHash.startsWith("$argon2id");
}
