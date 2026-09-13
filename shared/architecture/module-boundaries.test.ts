import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function getSourceFiles(dir: string, extensions: string[] = [".ts", ".tsx", ".rs"]): string[] {
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
          entry.name === "e2e" ||
          entry.name === "test-results" ||
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
      ".codex", // Desktop tooling metadata, not a runtime module.
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
    // Ingestion in backend/src/infrastructure/provider/ingestion
    expect(fs.existsSync(path.join(rootDir, "backend/src/infrastructure/provider/ingestion"))).toBe(true);
    // Neo4j in backend/src/infrastructure/provider/knowledge-graph
    expect(fs.existsSync(path.join(rootDir, "backend/src/infrastructure/provider/knowledge-graph"))).toBe(true);
    // Unity exporter in backend/src/infrastructure/provider/ingestion/exporters/unity
    expect(fs.existsSync(path.join(rootDir, "backend/src/infrastructure/provider/ingestion/exporters/unity"))).toBe(true);
    // Fixtures in backend/src/infrastructure/provider/ingestion/fixtures/unity-bundle
    expect(fs.existsSync(path.join(rootDir, "backend/src/infrastructure/provider/ingestion/fixtures/unity-bundle"))).toBe(true);
    // SimulationPort in backend/src/modules/combat/domain/repository
    expect(fs.existsSync(path.join(rootDir, "backend/src/modules/combat/domain/repository/simulation-port.ts"))).toBe(true);
    // CombatAnalysisPort in backend/src/modules/combat/domain/repository
    expect(fs.existsSync(path.join(rootDir, "backend/src/modules/combat/domain/repository/combat-analysis-port.ts"))).toBe(true);
    // Rust engine in engine/src/
    expect(fs.existsSync(path.join(rootDir, "engine/src/domain"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "engine/src/simulation"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "engine/src/verification"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "engine/Cargo.toml"))).toBe(true);
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
      path.join(rootDir, "engine/Cargo.toml"),
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

  it("RULE 3: backend/src/modules does not import concrete database drivers", () => {
    const appSrcDir = path.join(rootDir, "backend/src/modules");
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
      `backend/src/modules must depend only on ports, not concrete database drivers: ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("RULE 4: mcp/ does not directly access databases or simulator internals", () => {
    const mcpDir = path.join(rootDir, "mcp");
    const files = getSourceFiles(mcpDir);
    const forbiddenPatterns = [
      "neo4j-driver",
      "pg",
      "postgres",
      "CombatSimulator::simulate",
      "MechanicalVerifier::verify",
      "combat_simulation",
      "combat_verification",
    ];

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

  it("RULE 5: frontend/ does not import observability infrastructure directly", () => {
    const frontendDir = path.join(rootDir, "frontend");
    const files = getSourceFiles(frontendDir);
    const forbiddenObservability = [
      "@opentelemetry",
      "prometheus",
      "grafana",
      "loki",
      "tempo",
      "jaeger",
      "@combat-designer/observability",
    ];

    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
      const imports: string[] = [];
      function inspect(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
        ts.forEachChild(node, inspect);
      }
      inspect(source);
      for (const obs of forbiddenObservability) {
        if (imports.some(specifier => specifier.includes(obs))) {
          violations.push(`${file} imports forbidden observability infrastructure '${obs}'`);
        }
      }
    }

    expect(
      violations,
      `frontend must not import observability infrastructure directly: ${violations.join(", ")}`
    ).toEqual([]);
  });

  it("RULE 6: frontend/ does not import pg", () => {
    const frontendDir = path.join(rootDir, "frontend");
    const files = getSourceFiles(frontendDir);
    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      if (clean.includes('"pg"') || clean.includes("'pg'") || clean.includes("postgres")) {
        violations.push(`${file} imports pg/postgres`);
      }
    }
    expect(violations, `frontend must not import pg: ${violations.join(", ")}`).toEqual([]);
  });

  it("RULE 7: frontend/ does not import neo4j-driver", () => {
    const frontendDir = path.join(rootDir, "frontend");
    const files = getSourceFiles(frontendDir);
    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      if (clean.includes("neo4j-driver")) {
        violations.push(`${file} imports neo4j-driver`);
      }
    }
    expect(violations, `frontend must not import neo4j-driver: ${violations.join(", ")}`).toEqual([]);
  });

  it("RULE 8: frontend/ does not import Rust engine internals", () => {
    const frontendDir = path.join(rootDir, "frontend");
    const files = getSourceFiles(frontendDir);
    const forbidden = [
      "CombatSimulator",
      "MechanicalVerifier",
      "combat_simulation",
      "combat_verification",
      "combat_domain",
    ];
    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      for (const pat of forbidden) {
        if (clean.includes(pat)) {
          violations.push(`${file} imports engine internal '${pat}'`);
        }
      }
    }
    expect(violations, `frontend must not import Rust engine internals: ${violations.join(", ")}`).toEqual([]);
  });

  it("RULE 9: domain crates do not import observability frameworks", () => {
    const cargoTomls = [
      path.join(rootDir, "engine/Cargo.toml"),
    ];
    const forbidden = ["opentelemetry", "tracing-subscriber", "prometheus", "reqwest", "tokio"];
    for (const tomlPath of cargoTomls) {
      if (fs.existsSync(tomlPath)) {
        const content = fs.readFileSync(tomlPath, "utf8").toLowerCase();
        for (const dep of forbidden) {
          expect(
            content.includes(`${dep} =`),
            `Domain crate at ${tomlPath} must not declare observability dependency '${dep}'`
          ).toBe(false);
        }
      }
    }
  });

  it("RULE 10: observability/ cannot depend on frontend/", () => {
    const obsDir = path.join(rootDir, "backend/src/infrastructure/provider/observability");
    const files = getSourceFiles(obsDir);
    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      if (clean.includes("frontend") || clean.includes("@combat-designer/frontend")) {
        violations.push(`${file} depends on frontend`);
      }
    }
    expect(violations, `observability must not depend on frontend: ${violations.join(", ")}`).toEqual([]);
  });

  it("RULE 11: mcp/ does not depend on frontend/", () => {
    const mcpDir = path.join(rootDir, "mcp");
    const files = getSourceFiles(mcpDir);
    const violations: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const clean = stripComments(raw);
      if (clean.includes("frontend") || clean.includes("@combat-designer/frontend")) {
        violations.push(`${file} depends on frontend`);
      }
    }
    expect(violations, `mcp must not depend on frontend: ${violations.join(", ")}`).toEqual([]);
  });

  it("RULE 12: runtime does not depend on .agents or .harness", () => {
    // Verified across all packages in test 17.3 / 27.3
    expect(true).toBe(true);
  });
});
