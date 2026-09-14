import type { Analysis } from "../../../modules/combat/domain/entity/analysis.js";
import type { Character } from "../../../modules/combat/domain/entity/character.js";
import type { Combo, ComboEvaluation } from "../../../modules/combat/domain/entity/combo.js";
import type {
  AnalysisRepositoryPort,
  CharacterRepositoryPort,
  ComboFilter,
  ComboRepositoryPort,
} from "../../../modules/combat/domain/repository/index.js";
import type { PostgresDatabase } from "./database.js";

export class PostgresCharacterRepository implements CharacterRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findByWorkspace(workspaceId: string): Promise<Character[]> {
    const res = await this.db.query<{ document: Character }>(
      "SELECT document FROM characters WHERE workspace_id = $1 ORDER BY id ASC",
      [workspaceId]
    );
    return res.rows.map((r) => r.document);
  }

  public async findById(workspaceId: string, characterId: string): Promise<Character | null> {
    const res = await this.db.query<{ document: Character }>(
      "SELECT document FROM characters WHERE workspace_id = $1 AND id = $2",
      [workspaceId, characterId]
    );
    return res.rows[0]?.document ?? null;
  }

  public async save(character: Character): Promise<void> {
    await this.db.query(
      `INSERT INTO characters (workspace_id, id, document)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (workspace_id, id) DO UPDATE SET document = EXCLUDED.document`,
      [character.workspace_id, character.id, JSON.stringify(character)]
    );
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM characters WHERE workspace_id = $1", [
      workspaceId,
    ]);
    return Number(res.rows[0]?.count ?? 0);
  }
}

export class PostgresComboRepository implements ComboRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findByWorkspace(workspaceId: string, filter?: ComboFilter): Promise<Combo[]> {
    const conditions = ["workspace_id = $1"];
    const values: unknown[] = [workspaceId];
    if (filter?.character_id) {
      values.push(filter.character_id);
      conditions.push(`character_id = $${values.length}`);
    }
    if (filter?.source) {
      values.push(filter.source);
      conditions.push(`source = $${values.length}`);
    }
    const res = await this.db.query<{ document: Combo }>(
      `SELECT document FROM combos WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`,
      values
    );
    return res.rows.map((r) => r.document);
  }

  public async findById(workspaceId: string, comboId: string): Promise<Combo | null> {
    const res = await this.db.query<{ document: Combo }>(
      "SELECT document FROM combos WHERE workspace_id = $1 AND id = $2",
      [workspaceId, comboId]
    );
    return res.rows[0]?.document ?? null;
  }

  public async save(combo: Combo): Promise<void> {
    await this.db.query(
      `INSERT INTO combos (workspace_id, id, character_id, source, created_at, updated_at, document)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (workspace_id, id) DO UPDATE SET
         character_id = EXCLUDED.character_id,
         source = EXCLUDED.source,
         updated_at = EXCLUDED.updated_at,
         document = EXCLUDED.document`,
      [
        combo.workspace_id,
        combo.id,
        combo.character_id,
        combo.source,
        combo.created_at,
        combo.updated_at,
        JSON.stringify(combo),
      ]
    );
  }

  public async delete(workspaceId: string, comboId: string): Promise<boolean> {
    const res = await this.db.query("DELETE FROM combos WHERE workspace_id = $1 AND id = $2", [workspaceId, comboId]);
    await this.db.query("DELETE FROM combo_evaluations WHERE combo_id = $1", [comboId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async saveEvaluation(evaluation: ComboEvaluation): Promise<void> {
    await this.db.query(
      `INSERT INTO combo_evaluations (combo_id, document)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (combo_id) DO UPDATE SET document = EXCLUDED.document`,
      [evaluation.combo_id, JSON.stringify(evaluation)]
    );
  }

  public async getEvaluation(comboId: string): Promise<ComboEvaluation | null> {
    const res = await this.db.query<{ document: ComboEvaluation }>(
      "SELECT document FROM combo_evaluations WHERE combo_id = $1",
      [comboId]
    );
    return res.rows[0]?.document ?? null;
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM combos WHERE workspace_id = $1", [
      workspaceId,
    ]);
    return Number(res.rows[0]?.count ?? 0);
  }

  public async markEvaluationsStale(workspaceId: string, currentRevision: string): Promise<void> {
    const combos = await this.findByWorkspace(workspaceId);
    for (const combo of combos) {
      const evaluation = await this.getEvaluation(combo.id);
      if (evaluation && evaluation.project_revision !== currentRevision) {
        await this.saveEvaluation({ ...evaluation, is_stale: true });
      }
    }
  }
}

export class PostgresAnalysisRepository implements AnalysisRepositoryPort {
  constructor(private readonly db: PostgresDatabase) {}

  public async findByWorkspace(workspaceId: string, filter?: { character_id?: string }): Promise<Analysis[]> {
    const values: unknown[] = [workspaceId];
    const conditions = ["workspace_id = $1"];
    if (filter?.character_id) {
      values.push(filter.character_id);
      conditions.push(`character_id = $${values.length}`);
    }
    const res = await this.db.query<{ document: Analysis }>(
      `SELECT document FROM analyses WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      values
    );
    return res.rows.map((r) => r.document);
  }

  public async findById(workspaceId: string, analysisId: string): Promise<Analysis | null> {
    const res = await this.db.query<{ document: Analysis }>(
      "SELECT document FROM analyses WHERE workspace_id = $1 AND id = $2",
      [workspaceId, analysisId]
    );
    return res.rows[0]?.document ?? null;
  }

  public async save(analysis: Analysis): Promise<void> {
    await this.db.query(
      `INSERT INTO analyses (workspace_id, id, character_id, created_at, document)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (workspace_id, id) DO UPDATE SET
         character_id = EXCLUDED.character_id,
         created_at = EXCLUDED.created_at,
         document = EXCLUDED.document`,
      [
        analysis.workspace_id,
        analysis.id,
        analysis.character_id ?? null,
        analysis.created_at,
        JSON.stringify(analysis),
      ]
    );
  }

  public async countByWorkspace(workspaceId: string): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM analyses WHERE workspace_id = $1",
      [workspaceId]
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  public async findRecent(workspaceId: string, limit = 5): Promise<Analysis[]> {
    const res = await this.db.query<{ document: Analysis }>(
      "SELECT document FROM analyses WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2",
      [workspaceId, limit]
    );
    return res.rows.map((r) => r.document);
  }
}
