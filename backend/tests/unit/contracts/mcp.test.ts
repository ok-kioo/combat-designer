import { describe, it, expect } from "vitest";
import {
  PrincipalSchema,
  CapabilitySchema,
  ChangeSetProposalSchema,
  ChangeSetMutationSchema,
  CombatSearchInputSchema,
  CombatSimulateInputSchema,
  CombatAnalyzeInputSchema,
  CombatProposeChangeInputSchema,
  CombatIntentSchema,
  ResourceEnvelopeSchema,
  parseResourceUri,
  resolveCanonicalToolName,
  TOOL_ALIASES,
  redactSensitiveData,
  MCP_CONTRACT_VERSION,
} from "../../../src/modules/mcp/domain/entity/index.js";

describe("MCP Shared Contracts", () => {
  it("verifies MCP contract version is explicitly declared", () => {
    expect(MCP_CONTRACT_VERSION).toBe("mcp.contract.v1");
  });

  it("validates Principal with strict Zod parsing", () => {
    const validPrincipal = {
      principal_id: "designer-1",
      principal_type: "human",
      capabilities: ["combat:read", "changeset:apply"],
      authorized_workspaces: ["ws-default"],
    };
    const parsed = PrincipalSchema.parse(validPrincipal);
    expect(parsed.principal_id).toBe("designer-1");

    // Invalid capability fails
    expect(() =>
      PrincipalSchema.parse({
        ...validPrincipal,
        capabilities: ["invalid:capability"],
      })
    ).toThrow();

    // Extra properties rejected due to strict()
    expect(() =>
      PrincipalSchema.parse({
        ...validPrincipal,
        extra: "field",
      })
    ).toThrow();
  });

  it("ensures changeset:approve is distinct from changeset:apply", () => {
    const approveCap = CapabilitySchema.parse("changeset:approve");
    const applyCap = CapabilitySchema.parse("changeset:apply");
    expect(approveCap).not.toBe(applyCap);
  });

  it("validates ChangeSet discriminated mutations and proposal schema", () => {
    const mutation = {
      type: "attack_damage",
      attack_id: "atk_light_punch",
      current_damage: 20,
      proposed_damage: 25,
      reason: "Buff light attack damage",
    };
    const parsedMutation = ChangeSetMutationSchema.parse(mutation);
    expect(parsedMutation.type).toBe("attack_damage");

    const proposal = {
      changeset_id: "cs-101",
      workspace_id: "ws-1",
      base_revision: "rev-1",
      target_revision: "rev-2",
      proposed_by: "llm-agent-1",
      status: "proposed",
      mutations: [parsedMutation],
      created_at: new Date().toISOString(),
    };
    const parsedProposal = ChangeSetProposalSchema.parse(proposal);
    expect(parsedProposal.status).toBe("proposed");
  });

  it("resolves tool aliases to canonical tool names", () => {
    expect(resolveCanonicalToolName("query_combat")).toBe("combat_search");
    expect(resolveCanonicalToolName("simulate_changeset")).toBe("combat_simulate");
    expect(resolveCanonicalToolName("analyze_combat")).toBe("combat_analyze");
    expect(resolveCanonicalToolName("propose_changeset")).toBe("combat_propose_change");
    expect(resolveCanonicalToolName("withdraw_changeset")).toBe("combat_withdraw_change");
    expect(resolveCanonicalToolName("combat_search")).toBe("combat_search");
  });

  it("validates tool schemas strictly and rejects missing workspace_id", () => {
    expect(() =>
      CombatSearchInputSchema.parse({
        query: "punch",
      })
    ).toThrow();

    const validSearch = CombatSearchInputSchema.parse({
      workspace_id: "ws-alpha",
      query: "punch",
      min_cancel_window: 5,
    });
    expect(validSearch.workspace_id).toBe("ws-alpha");
  });

  it("parses resource URIs and rejects path traversal", () => {
    const parsed = parseResourceUri("combat://workspace/ws-test/attacks/light_punch");
    expect(parsed.workspace_id).toBe("ws-test");
    expect(parsed.resource_type).toBe("attacks");
    expect(parsed.resource_id).toBe("light_punch");

    expect(() =>
      parseResourceUri("combat://workspace/ws-test/attacks/../../etc/passwd")
    ).toThrow(/path traversal/i);

    expect(() =>
      parseResourceUri("combat://workspace/ws-test/unknown_type/id")
    ).toThrow(/invalid resource type/i);
  });

  it("validates structured LLM intents", () => {
    const searchIntent = {
      type: "search",
      workspace_id: "ws-1",
      query: "heavy",
    };
    const parsed = CombatIntentSchema.parse(searchIntent);
    expect(parsed.type).toBe("search");
  });

  it("redacts sensitive data in audit records", () => {
    const sensitive = {
      user: "alice",
      token: "secret-token-value",
      nested: {
        apiKey: "12345-api-key",
        normal: "value",
      },
    };
    const redacted = redactSensitiveData(sensitive) as any;
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.nested.apiKey).toBe("[REDACTED]");
    expect(redacted.nested.normal).toBe("value");
  });
});
