import type { Character, CharacterSummary } from "../entity/character.js";

export interface CharacterRepositoryPort {
  findByWorkspace(workspaceId: string): Promise<Character[]>;
  findById(workspaceId: string, characterId: string): Promise<Character | null>;
  save(character: Character): Promise<void>;
  countByWorkspace(workspaceId: string): Promise<number>;
}

export class InMemoryCharacterRepository implements CharacterRepositoryPort {
  private store = new Map<string, Map<string, Character>>();

  public async findByWorkspace(workspaceId: string): Promise<Character[]> {
    const wsMap = this.store.get(workspaceId);
    if (!wsMap) return [];
    return Array.from(wsMap.values());
  }

  public async findById(workspaceId: string, characterId: string): Promise<Character | null> {
    const wsMap = this.store.get(workspaceId);
    if (!wsMap) return null;
    return wsMap.get(characterId) || null;
  }

  public async save(character: Character): Promise<void> {
    let wsMap = this.store.get(character.workspace_id);
    if (!wsMap) {
      wsMap = new Map();
      this.store.set(character.workspace_id, wsMap);
    }
    wsMap.set(character.id, character);
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const wsMap = this.store.get(workspaceId);
    return wsMap ? wsMap.size : 0;
  }

  public clear(): void {
    this.store.clear();
  }
}
