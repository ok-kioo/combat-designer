import { describe, it, expect } from "vitest";
import {
  GateVerdictSchema,
  CheckStatusSchema,
  VerificationProfileSchema,
  VerificationRequestSchema,
  GateResultSchema,
  ViolationCodeSchema,
  EvidenceSchema,
} from "../src/verification/types.js";

describe("SPEC 05 — Verification Contracts & Schemas", () => {
  it("validates GateVerdict enum values", () => {
    const validVerdicts = ["PASS", "FAIL", "BLOCKED", "STALE", "BUDGET_EXCEEDED", "ERROR"];
    for (const v of validVerdicts) {
      expect(GateVerdictSchema.parse(v)).toBe(v);
    }

    expect(() => GateVerdictSchema.parse("UNKNOWN")).toThrow();
  });

  it("validates CheckStatus enum values", () => {
    const validStatuses = ["PASS", "FAIL", "BLOCKED", "INCONCLUSIVE", "BUDGET_EXCEEDED", "ERROR"];
    for (const s of validStatuses) {
      expect(CheckStatusSchema.parse(s)).toBe(s);
    }
  });

  it("validates canonical ViolationCode enum values", () => {
    const canonicalCodes = [
      "INFINITE_STUN_LOOP",
      "STUN_LOCK",
      "MAX_SUSTAINED_DPS",
      "MAX_BURST",
      "MAX_JUGGLE",
      "RESOURCE_SAFETY",
      "CANCEL_VALIDITY",
      "PROVENANCE_REQUIRED",
      "GUARD_INTEGRITY",
      "NO_COUNTERPLAY",
      "ZERO_RISK_ATTACK",
      "EXECUTION_BUDGET",
      "STALE_REVISION",
      "INVALID_SIMULATION",
    ];

    for (const code of canonicalCodes) {
      expect(ViolationCodeSchema.parse(code)).toBe(code);
    }
  });

  it("validates VerificationProfileSchema with defaults", () => {
    const profile = VerificationProfileSchema.parse({
      kind: "strict",
    });

    expect(profile.kind).toBe("strict");
    expect(profile.max_sustained_dps).toBe(150);
    expect(profile.max_burst_damage).toBe(250);
    expect(profile.dps_window_frames).toBe(60);
    expect(profile.require_provenance).toBe(true);
  });

  it("validates EvidenceSchema and enforces numeric invariants", () => {
    const evidence = EvidenceSchema.parse({
      evidence_id: "ev-01",
      kind: "max_sustained_dps_violation",
      severity: "critical",
      frame_start: 10,
      frame_end: 70,
      actor_ids: ["f1"],
      attack_ids: ["punch"],
      event_ids: [1, 2],
      state_fingerprints: ["f1:startup"],
      simulation_state_hash: "a".repeat(64),
      threshold: 150,
      observed: 200,
      cycle_states: [],
      stamina_cost_net: 0,
      observed_reaction_window_frames: 0,
      observed_dps: 200,
      observed_burst: 100,
      observed_juggle_frames: 0,
      guard_break_escape_options: 0,
      missing_provenance_fields: [],
      details: "Observed DPS exceeded limit",
    });

    expect(evidence.evidence_id).toBe("ev-01");
    expect(evidence.observed_dps).toBe(200);
  });

  it("validates GateResultSchema and fails on malformed hash", () => {
    const validGateResult = {
      gate_run_id: "run-001",
      workspace_id: "ws-1",
      project_revision: "rev-1",
      canonical_snapshot_hash: "snap-1",
      simulation_input_hash: "sim-1",
      simulation_state_hash: "state-1",
      event_log_hash: "log-1",
      verification_profile: "strict",
      rule_set_version: "1.0.0",
      verifier_version: "0.1.0",
      verdict: "PASS",
      checks: [
        {
          rule_id: "G01_SIMULATION_INTEGRITY",
          scenario_id: "s1",
          status: "PASS",
          threshold: 64,
          observed: 64,
          expected: "64-char hash",
          message: "Simulation integrity confirmed",
        },
      ],
      violations: [],
      evidence: [],
      budgets: {
        exhausted: false,
        events_analyzed: 10,
        states_explored: 10,
        cycles_checked: 0,
        steps_taken: 20,
        evidence_count: 0,
      },
      gate_result_hash: "a".repeat(64),
    };

    expect(GateResultSchema.parse(validGateResult).verdict).toBe("PASS");

    // Short hash fails validation
    const invalidHash = { ...validGateResult, gate_result_hash: "too_short" };
    expect(() => GateResultSchema.parse(invalidHash)).toThrow();
  });

  it("validates VerificationRequestSchema fails closed on missing workspace_id", () => {
    const validRequest = {
      workspace_id: "ws-1",
      project_id: "proj-1",
      project_revision: "rev-1",
      canonical_snapshot_hash: "snap-1",
      simulation_input_hash: "sim-1",
      simulation_input: { test: true },
      verification_profile: { kind: "strict" },
      rule_set_version: "1.0.0",
      verifier_version: "0.1.0",
    };

    expect(VerificationRequestSchema.parse(validRequest).workspace_id).toBe("ws-1");

    expect(() =>
      VerificationRequestSchema.parse({
        ...validRequest,
        workspace_id: "",
      })
    ).toThrow("workspace_id is strictly required");
  });
});
