import { describe, it, expect } from "vitest";
import {
  validateEnvelope,
  computeSha256,
  computeCanonicalBundleHash,
} from "../src/envelope.js";
import { checkParserCompatibility } from "../src/version-check.js";
import type { ExportBundleManifest } from "@combat-designer/shared-contracts";

describe("SPEC 02 — Manifest & Envelope Validation", () => {
  const file1 = "assets/attack_01.asset";
  const content1 = "startupFrames: 5\nactiveFrames: 2\ndamage: 50\n";
  const hash1 = computeSha256(content1);

  const checksums: Record<string, string> = {
    [file1]: hash1,
  };
  const bundleHash = computeCanonicalBundleHash(checksums);

  const validManifest: ExportBundleManifest = {
    schema_version: "1.0.0",
    engine: "unity",
    engine_version: "2026.1",
    project_id: "combat-core",
    project_revision: "rev-101",
    exporter_version: "1.0.0",
    parser_version: "1.0.0",
    format: "unity-yaml-scriptable-object",
    workspace_id: "ws-alpha",
    exported_at: "2026-09-09T14:00:00Z",
    asset_count: 1,
    checksums,
    bundle_hash: bundleHash,
  };

  it("valid manifest → ACCEPT", () => {
    const files = new Map<string, string>([[file1, content1]]);
    const res = validateEnvelope(validManifest, files, "ws-alpha");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.manifest?.project_id).toBe("combat-core");
  });

  it("invalid manifest schema → REJECT", () => {
    const files = new Map<string, string>([[file1, content1]]);
    const invalid = { ...validManifest, schema_version: "" };
    const res = validateEnvelope(invalid, files);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("schema_version"))).toBe(true);
  });

  it("missing file hash in manifest → REJECT", () => {
    const files = new Map<string, string>([[file1, content1]]);
    const withBadChecksum = {
      ...validManifest,
      checksums: { [file1]: "not-a-valid-sha256" },
    };
    const res = validateEnvelope(withBadChecksum, files);
    expect(res.valid).toBe(false);
  });

  it("hash mismatch between file and manifest → CONFLICT", () => {
    const files = new Map<string, string>([
      [file1, "tampered content that doesn't match checksum"],
    ]);
    const res = validateEnvelope(validManifest, files);
    expect(res.valid).toBe(false);
    expect(res.conflictType).toBe("checksum_mismatch");
    expect(res.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
  });

  it("bundle_hash mismatch → CONFLICT", () => {
    const files = new Map<string, string>([[file1, content1]]);
    const tamperedBundle = {
      ...validManifest,
      bundle_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    };
    const res = validateEnvelope(tamperedBundle, files);
    expect(res.valid).toBe(false);
    expect(res.conflictType).toBe("checksum_mismatch");
    expect(res.errors.some((e) => e.includes("bundle_hash mismatch"))).toBe(true);
  });

  it("unsupported parser/engine → CONFLICT", () => {
    const unrealManifest = {
      ...validManifest,
      engine: "unreal" as any,
    };
    const compat = checkParserCompatibility(unrealManifest);
    expect(compat.compatible).toBe(false);
    expect(compat.conflict?.conflict_type).toBe("unsupported_format");

    const versionMismatchManifest = {
      ...validManifest,
      exporter_version: "2.0.0", // Major version mismatch
    };
    const compat2 = checkParserCompatibility(versionMismatchManifest);
    expect(compat2.compatible).toBe(false);
    expect(compat2.conflict?.conflict_type).toBe("version_mismatch");
  });
});
