import { CharacterSchema } from '../domain/entity/character.js';
import type { CharacterRepositoryPort } from '../domain/repository/character-repository-port.js';
export async function createCharacter(repo: CharacterRepositoryPort, workspaceId: string, input: { name?: unknown; display_name?: unknown; metadata?: unknown }, id: string, now: string) {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw new Error('INVALID_CHARACTER_NAME');
  const character = CharacterSchema.parse({
    id, workspace_id: workspaceId, name: input.name.trim(),
    display_name: typeof input.display_name === 'string' ? input.display_name.trim().slice(0, 100) : input.name.trim(),
    metadata: input.metadata ?? {}, provenance: { imported_at: now, importer: 'designer' },
  });
  await repo.save(character);
  return character;
}
