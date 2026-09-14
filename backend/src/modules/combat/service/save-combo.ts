import type { ComboRepositoryPort } from "../domain/repository/combo-repository-port.js";
import type { CharacterRepositoryPort } from "../domain/repository/character-repository-port.js";
import type { Combo } from "../domain/entity/combo.js";
import type { CanonicalAttack } from "../../ingestion/domain/entity/snapshot.js";

export interface SaveComboInput {
  workspace_id: string;
  character_id: string;
  name: string;
  source?: "USER_CREATED" | "AI_DISCOVERED" | "IMPORTED";
  steps: Array<{ index: number; attack_id: string; condition?: "on_hit" | "on_block" | "always"; notes?: string }>;
  notes?: string;
  evidence?: Combo["evidence"];
}

export interface SaveComboResult {
  success: boolean;
  combo?: Combo;
  error?: "INVALID_COMBO_CHARACTER" | "ATTACK_NOT_FOUND" | "CHARACTER_NOT_FOUND" | "EMPTY_SEQUENCE";
  message?: string;
}

export class SaveComboUseCase {
  constructor(
    private readonly comboRepo: ComboRepositoryPort,
    private readonly characterRepo: CharacterRepositoryPort,
    private readonly getAttacks: (workspaceId: string) => Promise<CanonicalAttack[]>
  ) {}

  public async execute(input: SaveComboInput): Promise<SaveComboResult> {
    if (!input.steps || input.steps.length === 0) {
      return {
        success: false,
        error: "EMPTY_SEQUENCE",
        message: "Combo must contain at least one step",
      };
    }

    // Verify character exists in workspace
    const character = await this.characterRepo.findById(input.workspace_id, input.character_id);
    if (!character) {
      return {
        success: false,
        error: "CHARACTER_NOT_FOUND",
        message: `Character '${input.character_id}' does not exist in workspace '${input.workspace_id}'`,
      };
    }

    // Retrieve attacks for workspace
    const attacks = await this.getAttacks(input.workspace_id);
    const attackMap = new Map(attacks.map((a) => [a.id, a]));

    // Backend validation: Verify every attack in steps belongs strictly to this character
    for (const step of input.steps) {
      const attack = attackMap.get(step.attack_id);
      if (!attack) {
        return {
          success: false,
          error: "ATTACK_NOT_FOUND",
          message: `Attack '${step.attack_id}' not found in workspace`,
        };
      }

      // Check character association
      if (attack.character_id !== input.character_id) {
        return {
          success: false,
          error: "INVALID_COMBO_CHARACTER",
          message: `Attack '${step.attack_id}' belongs to character '${attack.character_id || "UNASSIGNED"}', which differs from combo character '${input.character_id}'`,
        };
      }
    }

    const now = new Date().toISOString();
    const comboId = `combo-${crypto.randomUUID()}`;

    const newCombo: Combo = {
      id: comboId,
      workspace_id: input.workspace_id,
      character_id: input.character_id,
      name: input.name,
      source: input.source || "USER_CREATED",
      steps: input.steps.map((s, idx) => ({
        index: idx,
        attack_id: s.attack_id,
        condition: s.condition || "on_hit",
        notes: s.notes,
      })),
      notes: input.notes,
      evidence: input.evidence,
      created_at: now,
      updated_at: now,
    };

    await this.comboRepo.save(newCombo);

    return {
      success: true,
      combo: newCombo,
    };
  }
}
