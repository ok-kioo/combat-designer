import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../../src/modules/auth/service/password-hasher.js";

describe("PasswordHasher Unit Tests", () => {
  it("should hash a password and verify it successfully", () => {
    const raw = "SuperSecret2026!";
    const hash = hashPassword(raw);

    expect(hash).toBeDefined();
    expect(hash).toContain(":");
    expect(verifyPassword(raw, hash)).toBe(true);
  });

  it("should reject an incorrect password", () => {
    const raw = "CorrectPassword123";
    const hash = hashPassword(raw);

    expect(verifyPassword("WrongPassword456", hash)).toBe(false);
  });

  it("should generate distinct hashes for identical passwords due to unique salts", () => {
    const pwd = "IdenticalPassword789";
    const hash1 = hashPassword(pwd);
    const hash2 = hashPassword(pwd);

    expect(hash1).not.toBe(hash2);
    expect(verifyPassword(pwd, hash1)).toBe(true);
    expect(verifyPassword(pwd, hash2)).toBe(true);
  });

  it("should fail gracefully on invalid or corrupted hash format", () => {
    expect(verifyPassword("pass", "")).toBe(false);
    expect(verifyPassword("pass", "malformed")).toBe(false);
    expect(verifyPassword("pass", "invalid:salt:format:extra")).toBe(false);
    expect(verifyPassword("pass", "nothex:nothex")).toBe(false);
  });
});
