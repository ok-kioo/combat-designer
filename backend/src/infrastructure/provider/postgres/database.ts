import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export class PostgresDatabase {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string, config: PoolConfig = {}) {
    this.pool = new Pool({ connectionString, ...config });
    this.ready = this.runMigrations();
  }

  public async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    await this.ready;
    return this.pool.query<T>(text, values);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT now()::text
        )
      `);

      for (const migration of migrations()) {
        const existing = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [
          migration.version,
        ]);
        if (existing.rowCount) continue;
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function migrations(): Array<{ version: string; sql: string }> {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(dirname, "migrations", "0001_canonical_persistence.sql"),
    path.join(process.cwd(), "src", "infrastructure", "provider", "postgres", "migrations", "0001_canonical_persistence.sql"),
  ];
  const migrationPath = candidates.find((candidate) => existsSync(candidate));
  if (!migrationPath) {
    throw new Error(`PostgreSQL migration 0001_canonical_persistence.sql not found. Checked: ${candidates.join(", ")}`);
  }
  return [
    {
      version: "0001_canonical_persistence",
      sql: readFileSync(migrationPath, "utf8"),
    },
  ];
}

export function createPostgresDatabaseFromEnv(): PostgresDatabase | null {
  const connectionString = process.env.DATABASE_URL;
  return connectionString ? new PostgresDatabase(connectionString) : null;
}
