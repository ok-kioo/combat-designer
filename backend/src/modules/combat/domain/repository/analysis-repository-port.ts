import type { Analysis } from "../entity/analysis.js";

export interface AnalysisRepositoryPort {
  findByWorkspace(workspaceId: string, filter?: { character_id?: string }): Promise<Analysis[]>;
  findById(workspaceId: string, analysisId: string): Promise<Analysis | null>;
  save(analysis: Analysis): Promise<void>;
  countByWorkspace(workspaceId: string): Promise<number>;
  findRecent(workspaceId: string, limit?: number): Promise<Analysis[]>;
}

export class InMemoryAnalysisRepository implements AnalysisRepositoryPort {
  private store = new Map<string, Map<string, Analysis>>();

  public async findByWorkspace(workspaceId: string, filter?: { character_id?: string }): Promise<Analysis[]> {
    const wsMap = this.store.get(workspaceId);
    if (!wsMap) return [];
    let list = Array.from(wsMap.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (filter?.character_id) {
      list = list.filter((a) => a.character_id === filter.character_id);
    }
    return list;
  }

  public async findById(workspaceId: string, analysisId: string): Promise<Analysis | null> {
    const wsMap = this.store.get(workspaceId);
    if (!wsMap) return null;
    return wsMap.get(analysisId) || null;
  }

  public async save(analysis: Analysis): Promise<void> {
    let wsMap = this.store.get(analysis.workspace_id);
    if (!wsMap) {
      wsMap = new Map();
      this.store.set(analysis.workspace_id, wsMap);
    }
    wsMap.set(analysis.id, analysis);
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const wsMap = this.store.get(workspaceId);
    return wsMap ? wsMap.size : 0;
  }

  public async findRecent(workspaceId: string, limit = 5): Promise<Analysis[]> {
    const all = await this.findByWorkspace(workspaceId);
    return all.slice(0, limit);
  }

  public clear(): void {
    this.store.clear();
  }
}
