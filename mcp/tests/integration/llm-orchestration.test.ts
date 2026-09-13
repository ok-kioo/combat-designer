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

  it("06.T.16: fabricated clean analysis claim is rejected when findings exist", async () => {
    const analysisWithFindings = {
      status: "COMPLETED",
      findings: [{ code: "DPS_EXCEEDED", severity: "HIGH" }],
    };

    expect(() =>
      env.server.orchestrator.validateLlmClaim("COMPLETED_CLEAN", analysisWithFindings)
    ).toThrow(/Fabricated claim rejected/);
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

  it("06.T.18: analysis status is preserved exactly", async () => {
    const analysisResult = {
      analysis_id: "an_1",
      status: "COMPLETED",
      findings: [],
    };

    const preserved = env.server.orchestrator.preserveAnalysisStatus(analysisResult);
    expect(preserved).toBe("COMPLETED");
  });

  it("06.T.19: execution of analyze intent invokes combat_analyze", async () => {
    const res = (await env.server.orchestrator.executeIntent(env.llmDirector, {
      type: "verify",
      workspace_id: "ws-alpha",
      project_id: "p1",
      project_revision: "rev-1",
      canonical_snapshot_hash: "snap-1",
      simulation_input_hash: "sim-1",
      profile: "strict",
    })) as any;

    expect(res.classification).toBe("SIMULATION_RESULT");
    expect(res.data.source).toBe("combat_analysis");
  });

  it("06.T.20: consultative recommendations provide actionable guidance", async () => {
    env.analysisPort.findings = [
      {
        id: "fnd-1",
        code: "RECOVERY_TOO_LOW",
        severity: "high",
        title: "Excessive frame advantage",
        description: "Recovery is too short relative to hitstun.",
      },
    ];

    const res = await env.gateway.execute(env.llmDirector, "combat_analyze", {
      workspace_id: "ws-alpha",
      subject: "Recovery check",
    });

    const data = res.data as any;
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].code).toBe("RECOVERY_TOO_LOW");
  });
});
