import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function getSourceFiles(dir: string, extensions: string[] = [".ts", ".rs"]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "target" ||
          entry.name === "tests" ||
          entry.name === "fixtures" ||
          entry.name === ".agents" ||
          entry.name === ".harness"
        ) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        if (extensions.some((ext) => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

function stripComments(content: string): string {
  // Remove single line comments
  let clean = content.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  clean = clean.replace(/\/\*[\s\S]*?\*\//gm, "");
  return clean;
}

describe("Architecture & Module Boundary Invariants", () => {
  const rootDir = process.cwd();

  it("17.1 / 27.1: Root cleanliness — allows only canonical root directories", () => {
    const allowed = new Set([
      ".agents",
      ".harness",
      "backend",
      "engine",
      "frontend",
      "mcp",
      "shared",
    ]);

    const ignored = new Set([
      ".git",
      "node_modules",
    ]);

    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const directories = entries
      .filter((e) => e.isDirectory() && !ignored.has(e.name))
      .map((e) => e.name);

    for (const dir of directories) {
      expect(
        allowed.has(dir),
        `Root directory '${dir}' is not in the allowed root set: ${Array.from(allowed).join(", ")}`
      ).toBe(true);
    }
  });

  it("17.2 / 27.2: Legacy directories — fails if any prohibited directory exists in root", () => {
    const prohibited = [
      "packages",
      "crates",
      "infrastructure",
      "scripts",
      "tests",
      "fixtures",
      "exporters",
      "target",
      "data",
      "docs",
      "specs",
      "rules",
      "regras",
      "skills",
      ".docs",
      ".specs",
      ".rules",
      ".skills",
    ];

    for (const dirName of prohibited) {
      const fullPath = path.join(rootDir, dirName);
      expect(
        fs.existsSync(fullPath),
        `Prohibited legacy directory '${dirName}' must NOT exist in root`
      ).toBe(false);
    }
  });

  it("17.3 / 27.3: Harness isolation — product runtime code MUST NEVER import .agents/ or .harness/", () => {
    const productDirs = [
      path.join(rootDir, "backend"),
      path.join(rootDir, "engine"),
      path.join(rootDir, "mcp"),
      path.join(rootDir, "frontend"),
      path.join(rootDir, "shared"),
    ];

    const violations: string[] = [];
    const importRegex = /(?:import|from|require)\s*\(?['"][^'"]*(\.agents|\.harness)/;

    for (const dir of productDirs) {
      const files = getSourceFiles(dir);
      for (const file of files) {
        if (file.endsWith("module-boundaries.test.ts")) continue;

        const raw = fs.readFileSync(file, "utf8");
        const clean = stripComments(raw);
        if (importRegex.test(clean) || clean.includes(".agents/") || clean.includes(".harness/")) {
          violations.push(file);
        }
      }
    }

    expect(
      violations,
      `Product runtime code MUST NEVER import from .agents/ or .harness/: ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("17.4 / 27.4: Symlink policy — no architectural symlinks in repository", () => {
    function findSymlinks(current: string): string[] {
      const symlinks: string[] = [];
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const fullPath = path.join(current, entry.name);
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
          symlinks.push(fullPath);
        } else if (lstat.isDirectory()) {
          symlinks.push(...findSymlinks(fullPath));
        }
      }
      return symlinks;
    }

    const architecturalSymlinks = findSymlinks(rootDir);
    expect(
      architecturalSymlinks,
      `No architectural symlinks are allowed: ${architecturalSymlinks.join(", ")}`
    ).toEqual([]);
  });

  it("17.5 / 27.5: Module ownership — components reside strictly in designated modules", () => {
    // Ingestion in backend/infrastructure/ingestion
    expect(fs.existsSync(path.join(rootDir, "backend/infrastructure/ingestion/src"))).toBe(true);
    // Neo4j in backend/infrastructure/neo4j
    expect(fs.existsSync(path.join(rootDir, "backend/infrastructure/neo4j/src"))).toBe(true);
    // Unity exporter in backend/infrastructure/ingestion/exporters/unity
    expect(fs.existsSync(path.join(rootDir, "backend/infrastructure/ingestion/exporters/unity"))).toBe(true);
    // Fixtures in backend/infrastructure/ingestion/fixtures/unity-bundle
    expect(fs.existsSync(path.join(rootDir, "backend/infrastructure/ingestion/fixtures/unity-bundle"))).toBe(true);
    // SimulationPort in backend/application
    expect(fs.existsSync(path.join(rootDir, "backend/application/src/ports/simulation-port.ts"))).toBe(true);
    // MechanicalGatePort in backend/application
    expect(fs.existsSync(path.join(rootDir, "backend/application/src/ports/mechanical-gate-port.ts"))).toBe(true);
    // Rust engine in engine/
    expect(fs.existsSync(path.join(rootDir, "engine/combat-domain/src"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "engine/combat-simulation/src"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "engine/combat-verification/src"))).toBe(true);
    // MCP in mcp/
    expect(fs.existsSync(path.join(rootDir, "mcp/gateway"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "mcp/server"))).toBe(true);
    // FIC validator in .agents/validators/fic
    expect(fs.existsSync(path.join(rootDir, ".agents/validators/fic/validate-cli.ts"))).toBe(true);
    // Canonical documentation in .harness/
    expect(fs.existsSync(path.join(rootDir, ".harness/docs/architecture"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, ".harness/specs"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, ".harness/rules"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, ".harness/skills"))).toBe(true);
  });

  it("RULE 2: engine/ does not depend on backend, frontend, mcp, or infrastructure", () => {
    const cargoTomls = [
      path.join(rootDir, "engine/combat-domain/Cargo.toml"),
      path.join(rootDir, "engine/combat-simulation/Cargo.toml"),
      path.join(rootDir, "engine/combat-verification/Cargo.toml"),
    ];

    const forbidden = ["backend", "frontend", "mcp", "infrastructure", "tokio", "neo4j", "postgres"];
    for (const tomlPath of cargoTomls) {
      if (fs.existsSync(tomlPath)) {
        const content = fs.readFileSync(tomlPath, "utf8").toLowerCase();
        for (const dep of forbidden) {
          expect(
            content.includes(`${dep} =`),
            `Engine Cargo.toml at ${tomlPath} must not declare forbidden dependency '${dep}'`
          ).toBe(false);
        }
      }
    }
  });

  it("RULE 3: backend/application does not import concrete database drivers", () => {
    const appSrcDir = path.join(rootDir, "backend/application/src");
    const files = getSourceFiles(appSrcDir);
    const forbiddenDrivers = ["neo4j-driver", "pg", "postgres", "mysql", "sqlite3", "typeorm", "prisma"];

    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      for (const driver of forbiddenDrivers) {
        if (clean.includes(`"${driver}"`) || clean.includes(`'${driver}'`)) {
          violations.push(`${file} imports concrete driver '${driver}'`);
        }
      }
    }

    expect(
      violations,
      `backend/application must depend only on ports, not concrete database drivers: ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("RULE 4: mcp/ does not directly access databases or simulator internals", () => {
    const mcpDir = path.join(rootDir, "mcp");
    const files = getSourceFiles(mcpDir);
    const forbiddenPatterns = ["neo4j-driver", "pg", "CombatSimulator::simulate"];

    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      for (const pattern of forbiddenPatterns) {
        if (clean.includes(pattern)) {
          violations.push(`${file} violates isolation by referencing '${pattern}'`);
        }
      }
    }

    expect(
      violations,
      `mcp must access capabilities through Application layer, not direct DB or simulator: ${violations.join(", ")}`
    ).toEqual([]);
  });
});
