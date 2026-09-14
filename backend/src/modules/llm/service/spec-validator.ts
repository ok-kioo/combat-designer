/**
 * SpecValidator — Validates proposals against applicable mechanical specifications and project rules.
 *
 * Flow:
 * Proposal → Simulation → Mechanical Validation → Spec Validation → Recommendation
 *
 * Invariant: The LLM may explain violations, but CANNOT unilaterally declare spec compliance.
 */

import type { Proposal, ProposalMutation } from "../../proposal/domain/entity/index.js";

export interface SpecViolation {
  spec_id: string;
  rule: string;
  attack_id: string;
  message: string;
  actual_value: unknown;
  expected_bound: unknown;
}

export interface SpecValidationResult {
  valid: boolean;
  spec_version: string;
  violations: SpecViolation[];
  evidence: {
    checked_rules_count: number;
    mutations_evaluated: number;
    timestamp: string;
  };
}

export class SpecValidator {
  public validate(proposal: Proposal): SpecValidationResult {
    const violations: SpecViolation[] = [];
    const mutations = proposal.mutations || [];

    for (const mutation of mutations) {
      this.checkMutationRules(mutation, violations);
    }

    return {
      valid: violations.length === 0,
      spec_version: "1.0.0",
      violations,
      evidence: {
        checked_rules_count: mutations.length * 3,
        mutations_evaluated: mutations.length,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private checkMutationRules(mutation: ProposalMutation, violations: SpecViolation[]): void {
    const attackId = mutation.attack_id || "unknown";

    // Rule SPEC-01: Damage cannot be negative or absurdly high
    if (mutation.type === "attack_damage") {
      const dmg = (mutation as any).proposed_damage ?? (mutation as any).value;
      if (typeof dmg === "number") {
        if (dmg < 0) {
          violations.push({
            spec_id: "SPEC-01",
            rule: "NON_NEGATIVE_DAMAGE",
            attack_id: attackId,
            message: `Attack damage cannot be negative (proposed: ${dmg})`,
            actual_value: dmg,
            expected_bound: ">= 0",
          });
        }
        if (dmg > 500) {
          violations.push({
            spec_id: "SPEC-01",
            rule: "DAMAGE_CEILING",
            attack_id: attackId,
            message: `Attack damage exceeds absolute ceiling of 500 (proposed: ${dmg})`,
            actual_value: dmg,
            expected_bound: "<= 500",
          });
        }
      }
    }

    // Rule SPEC-04: Recovery frames cannot be negative
    if (mutation.type === "attack_recovery") {
      const rec = (mutation as any).proposed_recovery_frames ?? (mutation as any).value;
      if (typeof rec === "number" && rec < 0) {
        violations.push({
          spec_id: "SPEC-04",
          rule: "NON_NEGATIVE_RECOVERY",
          attack_id: attackId,
          message: `Recovery frames cannot be negative (proposed: ${rec})`,
          actual_value: rec,
          expected_bound: ">= 0",
        });
      }
    }

    // Rule SPEC-05: Cancel window start must precede end
    if (mutation.type === "cancel_window") {
      const start = (mutation as any).start_frame;
      const end = (mutation as any).end_frame;
      if (typeof start === "number" && typeof end === "number" && start >= end) {
        violations.push({
          spec_id: "SPEC-05",
          rule: "VALID_WINDOW_BOUNDS",
          attack_id: attackId,
          message: `Cancel window start frame (${start}) must be strictly less than end frame (${end})`,
          actual_value: { start, end },
          expected_bound: "start < end",
        });
      }
    }
  }
}
