import crypto from "node:crypto";
import type { AccessTokenClaims } from "../domain/entity/auth.entity.js";

export const DEFAULT_JWT_SECRET =
  process.env.JWT_SECRET || "combat-designer-jwt-secret-key-2026-production-ready";
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export class TokenService {
  private readonly secret: string;
  private readonly accessTokenTtl: number;

  constructor(
    secret: string = DEFAULT_JWT_SECRET,
    accessTokenTtl = DEFAULT_ACCESS_TOKEN_TTL_SECONDS
  ) {
    this.secret = secret;
    this.accessTokenTtl = accessTokenTtl;
  }

  /**
   * Signs an HS256 JWT containing canonical AccessTokenClaims.
   * Per Spec 12: claims contain sub (user_id), username, display_name, iat, exp.
   * Never contains a list of workspaces or permissions.
   */
  public signAccessToken(
    payload: Omit<AccessTokenClaims, "iat" | "exp">,
    ttlSeconds: number = this.accessTokenTtl
  ): string {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      sub: payload.sub,
      username: payload.username,
      display_name: payload.display_name,
      iat: now,
      exp: now + ttlSeconds,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(claims));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(dataToSign)
      .digest("base64url");

    return `${dataToSign}.${signature}`;
  }

  /**
   * Verifies the HS256 signature, algorithm, expiration, and mandatory claims of a JWT.
   * Throws an Error if invalid, tampered, algorithm-confused, or expired.
   */
  public verifyAccessToken(token: string): AccessTokenClaims {
    if (!token || typeof token !== "string") {
      throw new Error("INVALID_TOKEN: Missing or malformed token string");
    }

    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      throw new Error("INVALID_TOKEN: Token must have 3 segments");
    }

    const [encodedHeader, encodedPayload, receivedSignature] = parts;

    // 1. Verify algorithm (prevent algorithm confusion attacks like none or RS256 with HMAC secret)
    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(base64UrlDecode(encodedHeader));
    } catch {
      throw new Error("INVALID_TOKEN: Could not parse token header");
    }

    if (header.alg !== "HS256") {
      throw new Error(`INVALID_ALGORITHM: Unsupported algorithm '${header.alg}', expected 'HS256'`);
    }

    // 2. Verify signature constant-time
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto
      .createHmac("sha256", this.secret)
      .update(dataToSign)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSignature);
    const receivedBuf = Buffer.from(receivedSignature);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new Error("INVALID_TOKEN: Signature verification failed");
    }

    // 3. Parse claims
    let claims: AccessTokenClaims;
    try {
      claims = JSON.parse(base64UrlDecode(encodedPayload)) as AccessTokenClaims;
    } catch {
      throw new Error("INVALID_TOKEN: Could not parse token claims");
    }

    // 4. Validate mandatory claims (sub, username)
    if (!claims.sub || typeof claims.sub !== "string" || claims.sub.trim() === "") {
      throw new Error("INVALID_CLAIMS: Missing required claim 'sub'");
    }
    if (!claims.username || typeof claims.username !== "string" || claims.username.trim() === "") {
      throw new Error("INVALID_CLAIMS: Missing required claim 'username'");
    }

    // 5. Validate expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      throw new Error(`TOKEN_EXPIRED: Token expired at timestamp ${claims.exp}`);
    }

    return claims;
  }

  /**
   * Generates a cryptographically random opaque refresh token and its SHA-256 hash.
   */
  public generateRefreshToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(32).toString("hex");
    const hash = this.hashRefreshToken(token);
    return { token, hash };
  }

  /**
   * Computes the SHA-256 hash of an opaque refresh token.
   */
  public hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
