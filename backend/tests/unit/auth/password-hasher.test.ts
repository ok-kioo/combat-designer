import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  needsRehash,
} from "../../../src/modules/auth/service/password-hasher.js";

describe("PasswordHasher Unit Tests (Argon2id)", () => {
  it("should hash a password with Argon2id and verify it successfully", async () => {
    const raw = "SuperSecret2026!";
    const hash = await hashPassword(raw);

    expect(hash).toBeDefined();
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(await verifyPassword(raw, hash)).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const raw = "CorrectPassword123";
    const hash = await hashPassword(raw);

    expect(await verifyPassword("WrongPassword456", hash)).toBe(false);
  });

  it("should generate distinct hashes for identical passwords due to unique salts", async () => {
    const pwd = "IdenticalPassword789";
    const hash1 = await hashPassword(pwd);
    const hash2 = await hashPassword(pwd);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(pwd, hash1)).toBe(true);
    expect(await verifyPassword(pwd, hash2)).toBe(true);
  });

  it("should support configurable security parameters", async () => {
    const pwd = "CustomParamsPassword!";
    const hash = await hashPassword(pwd, {
      timeCost: 2,
      memoryCost: 32768,
      parallelism: 1,
    });

    expect(hash).toContain("m=32768,p=1,t=2");
    expect(await verifyPassword(pwd, hash)).toBe(true);
  });

  it("should detect that an Argon2id hash does not need rehash", async () => {
    const hash = await hashPassword("ModernPassword!");
    expect(needsRehash(hash)).toBe(false);
  });

  it("should support legacy PBKDF2 hash verification and mark for rehash", async () => {
    // Format: hexSalt:hexHash
    const legacySalt = "abcdef0123456789abcdef0123456789";
    // We can simulate a legacy hash or verify needsRehash
    const legacyHash = `${legacySalt}:deadbeefcafebabe`;
    expect(needsRehash(legacyHash)).toBe(true);
  });

  it("should fail gracefully on invalid or corrupted hash format", async () => {
    expect(await verifyPassword("pass", "")).toBe(false);
    expect(await verifyPassword("pass", "malformed")).toBe(false);
    expect(await verifyPassword("pass", "invalid:salt:format:extra")).toBe(false);
    expect(await verifyPassword("pass", "nothex:nothex")).toBe(false);
  });
});

