import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.JWT_SECRET = process.env.JWT_SECRET || "mcp-test-jwt-secret-at-least-32-characters";

export default defineConfig({
  resolve: {
    alias: {
      "@combat-designer/backend": path.resolve(__dirname, "../backend/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
