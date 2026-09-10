import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  validateFicObject,
  validateFicYaml,
  validateFicFile,
  validateFicRegistry,
} from "../../../src/modules/fic/domain/entity/validator.js";

const VALID_FIC_OBJ = {
  feature_id: "test-feature-001",
  title: "Test Feature",
  owner: "Test Agent",
  status: "proposed",
  intent: "Test FIC schema validation.",
  domain_owner: "domain",
  categories: ["domain", "simulation"],
  approval: {
    gate_run_id: null,
  },
  contracts: [
    {
      name: "combat-canonical-model",
      version: "v1",
      change: "none",
    },
  ],
};

describe("SPEC 00 — Feature Impact Contract Validation", () => {
  it("valid FIC → ACCEPT", () => {
    const res = validateFicObject(VALID_FIC_OBJ);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.data?.feature_id).toBe("test-feature-001");
  });

  it("invalid FIC → REJECT (not an object)", () => {
    const res = validateFicObject("just a string");
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("missing required field → REJECT", () => {
    const missingTitle = { ...VALID_FIC_OBJ, title: undefined };
    const res = validateFicObject(missingTitle);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("title"))).toBe(true);

    const missingFeatureId = { ...VALID_FIC_OBJ, feature_id: "" };
    const res2 = validateFicObject(missingFeatureId);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("feature_id"))).toBe(true);

    const missingDomainOwner = { ...VALID_FIC_OBJ, domain_owner: undefined };
    const res3 = validateFicObject(missingDomainOwner);
    expect(res3.valid).toBe(false);
    expect(res3.errors.some((e) => e.includes("domain_owner"))).toBe(true);
  });

  it("unknown category → REJECT", () => {
    const withUnknownCat = {
      ...VALID_FIC_OBJ,
      categories: ["domain", "magic-layer-not-real"],
    };
    const res = validateFicObject(withUnknownCat);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e) => e.includes("Unknown impact category 'magic-layer-not-real'"))
    ).toBe(true);
  });

  it("released FIC without gate_run_id → REJECT", () => {
    const releasedWithoutGate = {
      ...VALID_FIC_OBJ,
      status: "released",
      approval: {
        gate_run_id: null,
      },
    };
    const res = validateFicObject(releasedWithoutGate);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e) => e.includes("approval.gate_run_id"))
    ).toBe(true);
  });

  it("released FIC with gate_run_id → ACCEPT", () => {
    const releasedWithGate = {
      ...VALID_FIC_OBJ,
      status: "released",
      approval: {
        gate_run_id: "gate-run-2026-09-09-001",
        gate_rule_set_version: "v1",
        model_revision: "rev-1",
        approved_by: "human_designer_1",
      },
    };
    const res = validateFicObject(releasedWithGate);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("YAML parsing works correctly", () => {
    const yamlStr = `
feature_id: yaml-feature-001
title: YAML Test
owner: Tester
status: implementing
intent: Test YAML parsing
domain_owner: gateway
categories:
  - gateway
  - security
contracts: []
`;
    const res = validateFicYaml(yamlStr);
    expect(res.valid).toBe(true);
    expect(res.data?.feature_id).toBe("yaml-feature-001");
  });

  it("FIC registry contains all required specs → ACCEPT", () => {
    let registryDir = path.resolve(process.cwd(), ".harness/docs/feature-impacts");
    if (!fs.existsSync(registryDir)) {
      registryDir = path.resolve(process.cwd(), "../.harness/docs/feature-impacts");
    }
    if (!fs.existsSync(registryDir)) {
      registryDir = path.resolve(process.cwd(), "../../.harness/docs/feature-impacts");
    }
    const summary = validateFicRegistry(registryDir);
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.valid).toBe(true);

    // Spec 00 FIC must be present
    const spec00 = summary.results.find(
      (r) => r.data?.feature_id === "spec-00-fic"
    );
    expect(spec00).toBeDefined();
    expect(spec00?.valid).toBe(true);
  });
});
