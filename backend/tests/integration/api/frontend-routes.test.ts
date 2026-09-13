import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ApiServer } from "../../../src/infrastructure/http/server.js";

describe("SPEC 10 — Frontend REST Routes Integration Tests (10.T.1 - 10.T.10)", () => {
  let server: ApiServer;
  let baseUrl: string;
  const workspaceId = "ws-combat-spec10";
  const port = 3456;

  beforeAll(async () => {
    server = new ApiServer({ port });
    await server.listen();
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Seed workspace with a sample snapshot
    const state = server.getWorkspaceState(workspaceId);
    state.has_snapshot = true;
    state.latest_revision = "rev-01";
    state.latest_snapshot_hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    state.history = [];
    state.latest_envelope = {
      workspace_id: workspaceId,
      project_id: "p-spec10",
      revision: "rev-01",
      snapshot_id: "snap-01",
      snapshot_hash: state.latest_snapshot_hash,
      parser_version: "1.0",
      schema_version: "1.0",
      canonical_snapshot: {
        workspace_id: workspaceId,
        project_id: "p-spec10",
        project_revision: "rev-01",
        snapshot_hash: state.latest_snapshot_hash,
        attacks: [
          {
            id: "atk_light_punch",
            name: { name: "Light Punch", raw_label: "Light Punch", untrusted_text: true },
            startup_frames: 4,
            active_frames: 3,
            recovery_frames: 8,
            damage: 25,
            hitstun_frames: 12,
            hitstop_frames: 4,
            blockstun_frames: 8,
            chip_damage: 0,
            guard_break_value: 0,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [
              {
                source_attack: "atk_light_punch",
                target_action: "atk_heavy_cleave",
                window: { start: 7, end: 12 },
                condition: "on_hit",
              },
            ],
            tags: ["light", "punch"],
            provenance: {
              status: "canonical",
              project_revision: "rev-01",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "punch_asset",
              source_path: "Assets/Punch.asset",
              confidence_permille: 1000,
            },
          },
          {
            id: "atk_heavy_cleave",
            name: { name: "Heavy Cleave", raw_label: "Heavy Cleave", untrusted_text: true },
            startup_frames: 18,
            active_frames: 6,
            recovery_frames: 24,
            damage: 120,
            hitstun_frames: 28,
            hitstop_frames: 8,
            blockstun_frames: 18,
            chip_damage: 15,
            guard_break_value: 40,
            invuln_windows: [],
            armor_windows: [],
            resource_costs: [],
            hitboxes: [],
            cancels: [],
            tags: ["heavy", "cleave"],
            provenance: {
              status: "canonical",
              project_revision: "rev-01",
              engine: "unity",
              parser_version: "1.0",
              asset_id: "cleave_asset",
              source_path: "Assets/Cleave.asset",
              confidence_permille: 1000,
            },
          },
        ],
      },
      quarantined: [],
      conflicts: [],
      created_at: new Date().toISOString(),
    };
  });

  it("10.T.1: GET /attacks returns attack list scoped to workspace with query/tag filters", async () => {
    // All attacks
    const resAll = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    expect(resAll.status).toBe(200);
    const bodyAll = await resAll.json();
    expect(bodyAll.count).toBe(2);
    expect(bodyAll.attacks[0].attack_id).toBe("atk_light_punch");
    expect(bodyAll.attacks[0].untrusted_text).toBe(true);

    // Filter by query "punch"
    const resFiltered = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks?query=punch`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    const bodyFiltered = await resFiltered.json();
    expect(bodyFiltered.count).toBe(1);
    expect(bodyFiltered.attacks[0].attack_id).toBe("atk_light_punch");

    // Filter by min_cancel_window
    const resCancel = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks?min_cancel_window=4`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    const bodyCancel = await resCancel.json();
    expect(bodyCancel.count).toBe(1);
  });

  it("10.T.2: GET /attacks/:attack_id returns attack detail and 404 for missing attack", async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks/atk_heavy_cleave`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attack.attack_id).toBe("atk_heavy_cleave");
    expect(body.attack.damage).toBe(120);

    const missingRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks/non_existent_attack`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    expect(missingRes.status).toBe(404);
  });

  it("10.T.3: POST /simulations executes simulation and records activity in workspace", async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/simulations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({
        scenario_id: "sc_duel_1",
        config: { budget: { max_frames: 60 } },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.simulation.simulation_id).toBe("sc_duel_1");
    expect(body.simulation.status).toBe("COMPLETED");

    // Check workspace state has recorded simulation
    const state = server.getWorkspaceState(workspaceId);
    expect(state.history.some((h) => h.type === "simulation" && h.id === "sc_duel_1")).toBe(true);
  });

  it("10.T.4: POST /analyses executes combat analysis and records run in workspace history", async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/analyses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({
        subject: "Stun Loop Test",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();

    const state = server.getWorkspaceState(workspaceId);
    expect(state.history.some((h) => h.type === "analysis")).toBe(true);
  });

  it("10.T.5: POST /changesets proposes and GET /changesets lists proposals", async () => {
    const createRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({
        base_revision: "rev-01",
        target_revision: "rev-02",
        mutations: [
          {
            type: "attack_damage",
            attack_id: "atk_light_punch",
            current_damage: 25,
            proposed_damage: 30,
            reason: "Buff punch slightly",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.status).toBe("PROPOSED");
    const csId = created.changeset.changeset_id;

    const listRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    const list = await listRes.json();
    expect(list.count).toBe(1);
    expect(list.changesets[0].changeset_id).toBe(csId);

    const getRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets/${csId}`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    const single = await getRes.json();
    expect(single.changeset.changeset_id).toBe(csId);
  });

  it("10.T.6: Disallows direct runtime mutations on changesets", async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets/cs_any/mutate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("10.T.7: Proposes changeset as purely consultative record", async () => {
    const cs = {
      changeset_id: "cs_consultative",
      workspace_id: workspaceId,
      base_revision: "rev-01",
      target_revision: "rev-02",
      proposed_by: "designer",
      status: "proposed" as const,
      mutations: [],
      created_at: new Date().toISOString(),
    };
    server.saveChangeset(cs);

    const getRes = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets/cs_consultative`, {
      headers: { "x-authorized-workspaces": workspaceId },
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.changeset.status).toBe("proposed");
  });

  it("10.T.8: POST /changesets/:id/withdraw withdraws proposal", async () => {
    server.saveChangeset({
      changeset_id: "cs_to_withdraw",
      workspace_id: workspaceId,
      base_revision: "rev-01",
      target_revision: "rev-02",
      proposed_by: "designer",
      status: "proposed",
      mutations: [],
      created_at: new Date().toISOString(),
    });

    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets/cs_to_withdraw/withdraw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({ reason: "Design direction changed" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("WITHDRAWN");
    expect(body.changeset.status).toBe("withdrawn");
  });

  it("10.T.9: POST /chat accepts LlmPromptContextEnvelope and returns structured director response", async () => {
    const res = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-authorized-workspaces": workspaceId,
      },
      body: JSON.stringify({
        prompt: "Please buff damage for Light Punch to 35",
        context: {
          snapshot_hash: "snap-abc",
          selected_attack_ids: ["atk_light_punch"],
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toContain("changeset proposal");
    expect(body.tool_calls.length).toBe(1);
    expect(body.tool_calls[0].tool_id).toBe("combat_propose_change");
    expect(body.tool_calls[0].untrusted_text).toBe(true);
    expect(body.proposed_changeset).toBeDefined();
    expect(body.proposed_changeset.mutations[0].proposed_damage).toBe(35);
    expect(body.context_envelope.selected_attack_ids).toContain("atk_light_punch");
  });

  it("10.T.10: Cross-workspace requests on all new routes return 403 Forbidden", async () => {
    const forbiddenHeaders = { "x-authorized-workspaces": "ws-other-unauthorized" };

    const r1 = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/attacks`, { headers: forbiddenHeaders });
    expect(r1.status).toBe(403);

    const r2 = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/simulations`, {
      method: "POST",
      headers: { ...forbiddenHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r2.status).toBe(403);

    const r3 = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/changesets`, { headers: forbiddenHeaders });
    expect(r3.status).toBe(403);

    const r4 = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/chat`, {
      method: "POST",
      headers: { ...forbiddenHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    expect(r4.status).toBe(403);
  });
});
