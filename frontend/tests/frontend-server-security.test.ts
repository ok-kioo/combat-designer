import { describe, expect, it } from "vitest";
import { createFrontendServer } from "../app/server";

describe("frontend server security", () => {
  it("rejects proxy backends outside the configured host allowlist", () => {
    expect(() => createFrontendServer({ apiUrl: "http://169.254.169.254" })).toThrow(
      "API_URL host is not in BACKEND_ALLOWED_HOSTS"
    );
  });

  it("rejects proxy backends with embedded credentials", () => {
    expect(() => createFrontendServer({ apiUrl: "http://user:pass@api:3001" })).toThrow(
      "API_URL must not include credentials"
    );
  });
});
