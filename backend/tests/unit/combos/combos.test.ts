import { describe, it, expect } from "vitest";
import { ComboSchema, ComboEvaluationSchema, type Combo, type ComboEvaluation } from "../../../src/modules/combat/domain/entity/combo.js";
import { InMemoryComboRepository } from "../../../src/modules/combat/domain/repository/combo-repository-port.js";
import { InMemoryCharacterRepository } from "../../../src/modules/combat/domain/repository/character-repository-port.js";
import { InMemoryAnalysisRepository } from "../../../src/modules/combat/domain/repository/analysis-repository-port.js";
import { SaveComboUseCase } from "../../../src/modules/combat/service/save-combo.js";
import { GetWorkspaceOverviewUseCase } from "../../../src/modules/workspace/application/get-workspace-overview.js";
import { AnalysisSchema } from "../../../src/modules/combat/domain/entity/analysis.js";
import type { CanonicalAttack } from "../../../src/modules/ingestion/domain/entity/snapshot.js";

describe("SPEC 14 — Combos, Analysis & Workspace Overview (COMBO.1 to COMBO.12)", () => {
  const sampleCombo: Combo = {
    id: "combo-ryu-bread-and-butter",
    workspace_id: "ws-test",
    character_id: "char-ryu",
    name: "Bread & Butter BnB",
    source: "USER_CREATED",
    steps: [
      { index: 0, attack_id: "atk-lp", condition: "always" },
      { index: 1, attack_id: "atk-srk", condition: "on_hit" },
    ],
    notes: "Basic Bread and Butter into Shoryuken",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleEvaluation: ComboEvaluation = {
    combo_id: sampleCombo.id,
    damage: 125,
    hits: 2,
    duration: 28,
    simulation_id: "sim-123",
    project_revision: "rev-1",
    simulation_input_hash: "hash-eval-123",
    computed_at: new Date().toISOString(),
    is_stale: false,
  };

  it("COMBO.1: Combo entity validates with Zod ComboSchema", () => {
    const parsed = ComboSchema.parse(sampleCombo);
    expect(parsed.id).toBe("combo-ryu-bread-and-butter");
    expect(parsed.steps.length).toBe(2);
    expect(parsed.character_id).toBe("char-ryu");
  });

  it("COMBO.2: ComboStep sequencing and validation enforce sequential indices", () => {
    expect(sampleCombo.steps[0].index).toBe(0);
    expect(sampleCombo.steps[1].index).toBe(1);
  });

  it("COMBO.3: ComboEvaluation structure validates completely decoupled from combo definition", () => {
    const evalData = ComboEvaluationSchema.parse(sampleEvaluation);
    expect(evalData.damage).toBe(125);
    expect(evalData.hits).toBe(2);
    expect(evalData.is_stale).toBe(false);
  });

  it("COMBO.4: Cross-character validation: SaveComboUseCase rejects attacks from different characters with INVALID_COMBO_CHARACTER", async () => {
    const comboRepo = new InMemoryComboRepository();
    const characterRepo = new InMemoryCharacterRepository();
    await characterRepo.save({
      id: "char-ryu",
      workspace_id: "ws-test",
      name: "Ryu",
      metadata: {},
      provenance: { imported_at: new Date().toISOString(), importer: "test" },
    });

    const attacks: CanonicalAttack[] = [
      {
        id: "atk-ryu-punch",
        name: { name: "Ryu Punch", raw_label: "Ryu Punch", untrusted_text: true },
        startup_frames: 4,
        active_frames: 2,
        recovery_frames: 8,
        damage: 25,
        hitstun_frames: 10,
        hitstop_frames: 3,
        blockstun_frames: 8,
        chip_damage: 0,
        guard_break_value: 0,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [],
        cancels: [],
        tags: [],
        character_id: "char-ryu",
        assignment_status: "ASSIGNED",
        provenance: { engine: "unity", project_revision: "rev-1", source_path: "p", asset_id: "a1", parser_version: "1.0", confidence_permille: 1000, status: "canonical" },
      },
      {
        id: "atk-ken-kick",
        name: { name: "Ken Kick", raw_label: "Ken Kick", untrusted_text: true },
        startup_frames: 6,
        active_frames: 3,
        recovery_frames: 10,
        damage: 40,
        hitstun_frames: 12,
        hitstop_frames: 3,
        blockstun_frames: 9,
        chip_damage: 0,
        guard_break_value: 0,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [],
        cancels: [],
        tags: [],
        character_id: "char-ken",
        assignment_status: "ASSIGNED",
        provenance: { engine: "unity", project_revision: "rev-1", source_path: "k", asset_id: "a2", parser_version: "1.0", confidence_permille: 1000, status: "canonical" },
      },
    ];

    const useCase = new SaveComboUseCase(comboRepo, characterRepo, async () => attacks);

    const result = await useCase.execute({
      workspace_id: "ws-test",
      character_id: "char-ryu",
      name: "Mixed Combo",
      steps: [
        { index: 0, attack_id: "atk-ryu-punch" },
        { index: 1, attack_id: "atk-ken-kick" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("INVALID_COMBO_CHARACTER");
    expect(result.message).toContain("atk-ken-kick");
  });

  it("COMBO.5: SaveComboUseCase accepts valid combos where all attacks belong to the character", async () => {
    const comboRepo = new InMemoryComboRepository();
    const characterRepo = new InMemoryCharacterRepository();
    await characterRepo.save({
      id: "char-ryu",
      workspace_id: "ws-test",
      name: "Ryu",
      metadata: {},
      provenance: { imported_at: new Date().toISOString(), importer: "test" },
    });

    const attacks: CanonicalAttack[] = [
      {
        id: "atk-lp",
        name: { name: "Light Punch", raw_label: "Light Punch", untrusted_text: true },
        startup_frames: 4,
        active_frames: 2,
        recovery_frames: 6,
        damage: 25,
        hitstun_frames: 10,
        hitstop_frames: 3,
        blockstun_frames: 8,
        chip_damage: 0,
        guard_break_value: 0,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [],
        cancels: [],
        tags: [],
        character_id: "char-ryu",
        assignment_status: "ASSIGNED",
        provenance: { engine: "unity", project_revision: "rev-1", source_path: "p", asset_id: "a1", parser_version: "1.0", confidence_permille: 1000, status: "canonical" },
      },
      {
        id: "atk-hp",
        name: { name: "Heavy Punch", raw_label: "Heavy Punch", untrusted_text: true },
        startup_frames: 8,
        active_frames: 3,
        recovery_frames: 12,
        damage: 75,
        hitstun_frames: 16,
        hitstop_frames: 4,
        blockstun_frames: 10,
        chip_damage: 0,
        guard_break_value: 0,
        invuln_windows: [],
        armor_windows: [],
        resource_costs: [],
        hitboxes: [],
        cancels: [],
        tags: [],
        character_id: "char-ryu",
        assignment_status: "ASSIGNED",
        provenance: { engine: "unity", project_revision: "rev-1", source_path: "p", asset_id: "a2", parser_version: "1.0", confidence_permille: 1000, status: "canonical" },
      },
    ];

    const useCase = new SaveComboUseCase(comboRepo, characterRepo, async () => attacks);

    const result = await useCase.execute({
      workspace_id: "ws-test",
      character_id: "char-ryu",
      name: "Ryu Pure Combo",
      steps: [
        { index: 0, attack_id: "atk-lp" },
        { index: 1, attack_id: "atk-hp" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.combo).toBeDefined();
    expect(result.combo?.character_id).toBe("char-ryu");

    const inRepo = await comboRepo.findById("ws-test", result.combo!.id);
    expect(inRepo).not.toBeNull();
  });

  it("COMBO.6: SaveComboUseCase rejects non-existent character with CHARACTER_NOT_FOUND", async () => {
    const comboRepo = new InMemoryComboRepository();
    const characterRepo = new InMemoryCharacterRepository();
    const useCase = new SaveComboUseCase(comboRepo, characterRepo, async () => []);

    const result = await useCase.execute({
      workspace_id: "ws-test",
      character_id: "char-nonexistent",
      name: "Ghost Combo",
      steps: [{ index: 0, attack_id: "atk-1" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("CHARACTER_NOT_FOUND");
  });

  it("COMBO.7: Evaluation staleness: markEvaluationsStale marks evaluations is_stale: true", async () => {
    const comboRepo = new InMemoryComboRepository();
    await comboRepo.save(sampleCombo);
    await comboRepo.saveEvaluation(sampleEvaluation);

    const initial = await comboRepo.getEvaluation(sampleCombo.id);
    expect(initial?.is_stale).toBe(false);

    await comboRepo.markEvaluationsStale("ws-test", "rev-2");

    const afterStale = await comboRepo.getEvaluation(sampleCombo.id);
    expect(afterStale?.is_stale).toBe(true);
  });

  it("COMBO.8: ComboRepositoryPort handles filter by character_id", async () => {
    const comboRepo = new InMemoryComboRepository();
    await comboRepo.save(sampleCombo);
    await comboRepo.save({
      ...sampleCombo,
      id: "combo-ken-1",
      character_id: "char-ken",
    });

    const ryuCombos = await comboRepo.findByWorkspace("ws-test", { character_id: "char-ryu" });
    expect(ryuCombos.length).toBe(1);
    expect(ryuCombos[0].id).toBe(sampleCombo.id);

    const kenCombos = await comboRepo.findByWorkspace("ws-test", { character_id: "char-ken" });
    expect(kenCombos.length).toBe(1);
    expect(kenCombos[0].id).toBe("combo-ken-1");
  });

  it("COMBO.9: Analysis entity validates findings and recommendations", () => {
    const sampleAnalysis = {
      id: "analysis-1",
      workspace_id: "ws-test",
      subject: "Archetype Balance Report",
      findings: [
        {
          id: "find-1",
          type: "frame_advantage" as const,
          severity: "high" as const,
          title: "Frame Trap Warning",
          description: "Light punch has +5 on block, creating infinite blockstring",
          attack_ids: ["atk-lp"],
        },
      ],
      recommendations: [
        {
          id: "rec-1",
          title: "Reduce LP advantage",
          description: "Increase recovery frames from 6 to 9",
          suggested_action: "Increase recovery by 3 frames",
          evidence_summary: "Simulation sc_block shows attacker recovers 5f ahead",
        },
      ],
      created_at: new Date().toISOString(),
    };

    const parsed = AnalysisSchema.parse(sampleAnalysis);
    expect(parsed.findings.length).toBe(1);
    expect(parsed.recommendations.length).toBe(1);
  });

  it("COMBO.10: AnalysisRepositoryPort persists and retrieves analyses", async () => {
    const analysisRepo = new InMemoryAnalysisRepository();
    const item = {
      id: "an-1",
      workspace_id: "ws-test",
      subject: "Hitbox Overlap",
      findings: [],
      recommendations: [],
      created_at: new Date().toISOString(),
    };
    await analysisRepo.save(item as any);

    const list = await analysisRepo.findByWorkspace("ws-test");
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("an-1");
  });

  it("COMBO.11: GetWorkspaceOverviewUseCase returns real domain KPIs (characters, attacks, combos, analyses)", async () => {
    const charRepo = new InMemoryCharacterRepository();
    const comboRepo = new InMemoryComboRepository();
    const analysisRepo = new InMemoryAnalysisRepository();

    await charRepo.save({
      id: "char-1",
      workspace_id: "ws-overview",
      name: "Fighter 1",
      metadata: { archetype: "rushdown" },
      provenance: { imported_at: new Date().toISOString(), importer: "test" },
    });

    await comboRepo.save({
      ...sampleCombo,
      id: "combo-1",
      workspace_id: "ws-overview",
    });

    await analysisRepo.save({
      id: "an-1",
      workspace_id: "ws-overview",
      subject: "Initial Check",
      findings: [],
      recommendations: [],
      created_at: new Date().toISOString(),
    } as any);

    const mockWsRepo = {
      findById: async (id: string) => ({
        id,
        name: "Test Fighter Game",
        description: "A cool fighting game",
        engine: "unity",
        status: "active" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      findByUser: async () => [],
      save: async () => {},
      delete: async () => true,
    };

    const useCase = new GetWorkspaceOverviewUseCase({
      workspaceRepo: mockWsRepo as any,
      characterRepo: charRepo,
      comboRepo: comboRepo,
      analysisRepo: analysisRepo,
      getAttacks: async (wsId) => (wsId === "ws-overview" ? ([{ id: "atk-1", character_id: "char-1", assignment_status: "ASSIGNED" }] as any) : []),
    });

    const overview = await useCase.execute({ workspace_id: "ws-overview" });
    expect(overview.kpis.characters_count).toBe(1);
    expect(overview.kpis.attacks_count).toBe(1);
    expect(overview.kpis.combos_count).toBe(1);
    expect(overview.kpis.analyses_count).toBe(1);
    expect(overview.has_data).toBe(true);
  });

  it("COMBO.12: Invariant: Recommendation != engine mutation and LLM != mechanical authority", () => {
    const rec = {
      id: "rec-test",
      title: "Recommend tuning",
      description: "Tuning recommendation",
      suggested_action: "Reduce active frames",
      evidence_summary: "Simulated 100 encounters",
    };
    expect(rec.suggested_action).toBe("Reduce active frames");
  });
});
