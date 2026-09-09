import { describe, it, expect, beforeEach } from "vitest";
import { createTestEnvironment } from "./test-helper.js";

describe("SPEC 06 — LLM Orchestration Tests (06.T.13 - 06.T.20)", () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  it("06.T.13: structured intent parsing succeeds for valid intents and rejects malformed intents", () => {
    const validSearchIntent = {
      type: "search",
      workspace_id: "ws-alpha",
      query: "cleave",
    };
    const parsed = env.server.orchestrator.parseIntent(validSearchIntent);
    expect(parsed.type).toBe("search");

    const invalidIntent = {
      type: "unknown_intent_type",
      workspace_id: "ws-alpha",
    };
    expect(() => env.server.orchestrator.parseIntent(invalidIntent)).toThrow(/Failed to parse structured combat intent/);
  });

  it("06.T.14: hallucinated attack ID is detected and rejected", async () => {
    const intent = {
      type: "propose" as const,
      workspace_id: "ws-alpha",
      base_revision: "rev-1",
      target_revision: "rev-2",
      mutations: [
        {
          type: "attack_damage" as const,
          attack_id: "atk_hallucinated_imaginary_999", // Does not exist
          current_damage: 50,
          proposed_damage: 100,
          reason: "Fabricated attack buff",
        },
      ],
      reason: "Make it strong",
      expected_effect: "High damage",
    };

    await expect(
      env.server.orchestrator.executeIntent(env.llmDirector, intent)
    ).rejects.toThrow(/Hallucinated attack ID 'atk_hallucinated_imaginary_999' does not exist/);
  });

  it("06.T.15: hallucinated workspace is rejected before execution", async () => {
    const intent = {
      type: "search" as const,
      workspace_id: "ws_hallucinated_other_project", // Not in llmDirector's authorized_workspaces
      query: "punch",
    };

    await expect(
      env.server.orchestrator.executeIntent(env.llmDirector, intent)
    ).rejects.toThrow(/Hallucinated or unauthorized workspace 'ws_hallucinated_other_project'/);
  });

  it("06.T.16: fabricated PASS is rejected when authoritative gate returned FAIL", async () => {
    env.gatePort.shouldFail = true;
    const gateResult = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      {} as any
    );

    expect(gateResult.verdict).toBe("FAIL");

    // LLM claims verdict was PASS
    expect(() =>
      env.server.orchestrator.validateLlmClaim("PASS", gateResult)
    ).toThrow(/Fabricated verdict rejected: LLM claimed PASS, but authoritative Mechanical Gate verdict is 'FAIL'/);
  });

  it("06.T.17: fabricated approval by LLM is strictly rejected", async () => {
    const intent = {
      type: "approve" as const,
      workspace_id: "ws-alpha",
      changeset_id: "cs-123",
      human_approver_id: "llm_director",
      decision: "approve" as const,
    };

    await expect(
      env.server.orchestrator.executeIntent(env.llmDirector, intent)
    ).rejects.toThrow(/Fabricated approval rejected: LLM cannot approve changesets/);
  });

  it("06.T.18: mechanical FAIL verdict is preserved exactly", async () => {
    env.gatePort.shouldFail = true;
    const gateResult = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      {} as any
    );

    const preserved = env.server.orchestrator.preserveMechanicalVerdict(gateResult);
    expect(preserved).toBe("FAIL");
  });

  it("06.T.19: BLOCKED verdict is preserved and never converted to PASS", async () => {
    env.gatePort.customVerdict = "BLOCKED";
    const gateResult = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      {} as any
    );

    const preserved = env.server.orchestrator.preserveMechanicalVerdict(gateResult);
    expect(preserved).toBe("BLOCKED");

    expect(() =>
      env.server.orchestrator.validateLlmClaim("PASS", gateResult)
    ).toThrow(/Fabricated verdict rejected/);
  });

  it("06.T.20: STALE verdict is preserved and never converted to PASS", async () => {
    env.gatePort.customVerdict = "STALE";
    const gateResult = await env.gatePort.verify(
      {
        workspace_id: "ws-alpha",
        project_id: "p1",
        project_revision: "rev-1",
        canonical_snapshot_hash: "snap_1",
        simulation_input_hash: "sim_1",
        simulation_input: {},
        verification_profile: { kind: "strict" } as any,
        verification_budget: {} as any,
        rule_set_version: "1.0",
        verifier_version: "1.0",
      },
      {} as any
    );

    const preserved = env.server.orchestrator.preserveMechanicalVerdict(gateResult);
    expect(preserved).toBe("STALE");

    expect(() =>
      env.server.orchestrator.validateLlmClaim("PASS", gateResult)
    ).toThrow(/Fabricated verdict rejected/);
  });
});
