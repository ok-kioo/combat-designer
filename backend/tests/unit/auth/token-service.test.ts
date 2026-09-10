import { describe, it, expect } from "vitest";
import { TokenService } from "../../../src/modules/auth/service/token-service.js";

describe("TokenService Unit Tests", () => {
  const secret = "test-secret-key-at-least-32-characters-long!";
  const tokenService = new TokenService(secret, 60);

  it("should sign and successfully verify an access token with canonical claims", () => {
    const payload = {
      sub: "usr-123",
      username: "combatdesigner",
      display_name: "Combat Designer",
    };

    const token = tokenService.signAccessToken(payload);
    expect(token).toBeDefined();
    expect(token.split(".")).toHaveLength(3);

    const verified = tokenService.verifyAccessToken(token);
    expect(verified.sub).toBe(payload.sub);
    expect(verified.username).toBe(payload.username);
    expect(verified.display_name).toBe(payload.display_name);
    expect((verified as any).workspaces).toBeUndefined(); // Never contains workspaces
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should throw when token signature is tampered", () => {
    const token = tokenService.signAccessToken({
      sub: "usr-safe",
      username: "safedesigner",
      display_name: "Safe Designer",
    });

    const parts = token.split(".");
    // Tamper with payload by changing one character
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "usr-evil", username: "evildesigner", display_name: "Evil Designer" })
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    expect(() => tokenService.verifyAccessToken(tamperedToken)).toThrow("Signature verification failed");
  });

  it("should throw when verifying an expired token", () => {
    const shortLivedService = new TokenService(secret, -10); // Expired 10 seconds ago
    const token = shortLivedService.signAccessToken({
      sub: "usr-expired",
      username: "olduser",
      display_name: "Old User",
    });

    expect(() => tokenService.verifyAccessToken(token)).toThrow("TOKEN_EXPIRED");
  });

  it("should generate unique refresh tokens and compute SHA-256 hash deterministically", () => {
    const rt1 = tokenService.generateRefreshToken();
    const rt2 = tokenService.generateRefreshToken();

    expect(rt1.token).not.toBe(rt2.token);
    expect(rt1.hash).toBe(tokenService.hashRefreshToken(rt1.token));
    expect(rt2.hash).toBe(tokenService.hashRefreshToken(rt2.token));
    expect(rt1.hash).not.toBe(rt2.hash);
  });
});

