import type { Combo, ComboEvaluation } from "../entity/combo.js";

export interface ComboFilter {
  character_id?: string;
  source?: string;
}

export interface ComboRepositoryPort {
  findByWorkspace(workspaceId: string, filter?: ComboFilter): Promise<Combo[]>;
  findById(workspaceId: string, comboId: string): Promise<Combo | null>;
  save(combo: Combo): Promise<void>;
  delete(workspaceId: string, comboId: string): Promise<boolean>;
  saveEvaluation(evaluation: ComboEvaluation): Promise<void>;
  getEvaluation(comboId: string): Promise<ComboEvaluation | null>;
  countByWorkspace(workspaceId: string): Promise<number>;
  markEvaluationsStale(workspaceId: string, currentRevision: string): Promise<void>;
}

export class InMemoryComboRepository implements ComboRepositoryPort {
  private combos = new Map<string, Map<string, Combo>>();
  private evaluations = new Map<string, ComboEvaluation>();

  public async findByWorkspace(workspaceId: string, filter?: ComboFilter): Promise<Combo[]> {
    const wsMap = this.combos.get(workspaceId);
    if (!wsMap) return [];
    let list = Array.from(wsMap.values());
    if (filter?.character_id) {
      list = list.filter((c) => c.character_id === filter.character_id);
    }
    if (filter?.source) {
      list = list.filter((c) => c.source === filter.source);
    }
    return list;
  }

  public async findById(workspaceId: string, comboId: string): Promise<Combo | null> {
    const wsMap = this.combos.get(workspaceId);
    if (!wsMap) return null;
    return wsMap.get(comboId) || null;
  }

  public async save(combo: Combo): Promise<void> {
    let wsMap = this.combos.get(combo.workspace_id);
    if (!wsMap) {
      wsMap = new Map();
      this.combos.set(combo.workspace_id, wsMap);
    }
    wsMap.set(combo.id, combo);
  }

  public async delete(workspaceId: string, comboId: string): Promise<boolean> {
    const wsMap = this.combos.get(workspaceId);
    if (!wsMap) return false;
    const deleted = wsMap.delete(comboId);
    this.evaluations.delete(comboId);
    return deleted;
  }

  public async saveEvaluation(evaluation: ComboEvaluation): Promise<void> {
    this.evaluations.set(evaluation.combo_id, evaluation);
  }

  public async getEvaluation(comboId: string): Promise<ComboEvaluation | null> {
    return this.evaluations.get(comboId) || null;
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const wsMap = this.combos.get(workspaceId);
    return wsMap ? wsMap.size : 0;
  }

  public async markEvaluationsStale(workspaceId: string, currentRevision: string): Promise<void> {
    const wsMap = this.combos.get(workspaceId);
    if (!wsMap) return;
    for (const comboId of wsMap.keys()) {
      const ev = this.evaluations.get(comboId);
      if (ev && ev.project_revision !== currentRevision) {
        ev.is_stale = true;
      }
    }
  }

  public clear(): void {
    this.combos.clear();
    this.evaluations.clear();
  }
}
