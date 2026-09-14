import { defineConfig } from "vitest/config";

process.env.JWT_SECRET = process.env.JWT_SECRET || "unit-test-jwt-secret-at-least-32-characters";

export default defineConfig({
  test: {
    environment: "node",
  },
});
