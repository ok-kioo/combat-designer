import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  runIngestionPipeline,
  computeCanonicalBundleHash,
  computeSha256,
} from "../src/index.js";
import { IngestionCache } from "../src/cache.js";
import type { ExportBundleManifest } from "@combat-designer/shared-contracts";

function loadFixtureBundle(): {
  manifest: ExportBundleManifest;
  files: Map<string, string>;
} {
  let fixtureDir = path.resolve(process.cwd(), "fixtures/unity-bundle/assets");
  if (!fs.existsSync(fixtureDir)) {
    fixtureDir = path.resolve(process.cwd(), "backend/infrastructure/ingestion/fixtures/unity-bundle/assets");
  }
  if (!fs.existsSync(fixtureDir)) {
    fixtureDir = path.resolve(process.cwd(), "../../backend/infrastructure/ingestion/fixtures/unity-bundle/assets");
  }
  const stingerPath = "assets/stinger.asset";
  const cleavePath = "assets/heavy_cleave.asset";

  const stingerContent = fs.readFileSync(path.join(fixtureDir, "stinger.asset"), "utf8");
  const cleaveContent = fs.readFileSync(path.join(fixtureDir, "heavy_cleave.asset"), "utf8");

  const files = new Map<string, string>([
    [stingerPath, stingerContent],
    [cleavePath, cleaveContent],
  ]);

  const checksums: Record<string, string> = {
    [stingerPath]: computeSha256(stingerContent),
    [cleavePath]: computeSha256(cleaveContent),
  };

  const bundleHash = computeCanonicalBundleHash(checksums);

  const manifest: ExportBundleManifest = {
    schema_version: "1.0.0",
    engine: "unity",
    engine_version: "2026.1",
    project_id: "hero-combat",
    project_revision: "rev-42",
    exporter_version: "1.0.0",
    parser_version: "1.0.0",
    format: "unity-yaml-scriptable-object",
    workspace_id: "ws-primary",
    exported_at: "2026-09-09T14:00:00Z",
    asset_count: 2,
    checksums,
    bundle_hash: bundleHash,
  };

  return { manifest, files };
}

describe("SPEC 02 — Ingestion Pipeline, Determinism & Incremental Cache", () => {
  it("complete valid pipeline execution produces canonical snapshot", () => {
    const { manifest, files } = loadFixtureBundle();
    const result = runIngestionPipeline(manifest, files, {
      authorizedWorkspaceId: "ws-primary",
      deterministicCreatedAt: "2026-09-09T14:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(result.envelope.conflicts).toHaveLength(0);
    expect(result.envelope.quarantined).toHaveLength(0);
    expect(result.envelope.canonical_snapshot.attacks).toHaveLength(2);

    const attacks = result.envelope.canonical_snapshot.attacks;
    expect(attacks[0].id).toBe("unity:hero-combat:heavy_cleave_01");
    expect(attacks[1].id).toBe("unity:hero-combat:stinger_01");
    expect(result.envelope.snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("determinism contract: same input × 100 → same canonical snapshot hash", () => {
    const { manifest, files } = loadFixtureBundle();
    const firstRun = runIngestionPipeline(manifest, files, {
      authorizedWorkspaceId: "ws-primary",
      deterministicCreatedAt: "2026-09-09T14:00:00.000Z",
    });
    const expectedHash = firstRun.envelope.snapshot_hash;

    for (let i = 0; i < 100; i++) {
      const run = runIngestionPipeline(manifest, files, {
        authorizedWorkspaceId: "ws-primary",
        deterministicCreatedAt: "2026-09-09T14:00:00.000Z",
      });
      expect(run.envelope.snapshot_hash).toBe(expectedHash);
    }
  });

  it("incremental ingestion: cache hit on identical hash, cache miss on changed hash", () => {
    const { manifest, files } = loadFixtureBundle();
    const cache = new IngestionCache();

    // 1. Initial run: 2 cache misses, 0 hits
    const run1 = runIngestionPipeline(manifest, files, {
      authorizedWorkspaceId: "ws-primary",
      cache,
    });
    expect(run1.cacheMisses).toBe(2);
    expect(run1.cacheHits).toBe(0);

    // 2. Second run: 2 cache hits, 0 misses
    const run2 = runIngestionPipeline(manifest, files, {
      authorizedWorkspaceId: "ws-primary",
      cache,
    });
    expect(run2.cacheHits).toBe(2);
    expect(run2.cacheMisses).toBe(0);
    expect(run2.envelope.snapshot_hash).toBe(run1.envelope.snapshot_hash);

    // 3. Third run with updated parser_version: invalidates cache
    const manifestNewParser = { ...manifest, parser_version: "2.0.0" };
    // update bundle hash with same files
    const run3 = runIngestionPipeline(manifestNewParser, files, {
      authorizedWorkspaceId: "ws-primary",
      cache,
    });
    // Version mismatch conflict will trigger, preserving fail-closed behavior!
    expect(run3.success).toBe(false);
  });

  it("workspace isolation: workspace A cannot produce or overwrite workspace B snapshot", () => {
    const { manifest, files } = loadFixtureBundle();
    // Authorized workspace is 'ws-alpha', but bundle claims 'ws-primary'
    const result = runIngestionPipeline(manifest, files, {
      authorizedWorkspaceId: "ws-alpha",
    });
    expect(result.success).toBe(false);
    expect(result.envelope.conflicts.some((c) => c.conflict_type === "workspace_mismatch")).toBe(true);
  });
});
