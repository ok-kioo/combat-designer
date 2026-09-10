import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
