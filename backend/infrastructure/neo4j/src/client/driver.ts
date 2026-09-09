import neo4j, { type Driver as Neo4jNativeDriver, type Session as Neo4jNativeSession } from "neo4j-driver";

export interface GraphRecord {
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
}

export interface GraphQueryResult {
  records: GraphRecord[];
}

export interface GraphSession {
  run(query: string, parameters?: Record<string, unknown>): Promise<GraphQueryResult>;
  close(): Promise<void>;
}

export interface GraphDriver {
  session(): GraphSession;
  verifyConnectivity(): Promise<boolean>;
  close(): Promise<void>;
}

export class Neo4jGraphDriver implements GraphDriver {
  private nativeDriver: Neo4jNativeDriver;

  constructor(uri: string, user: string, pass: string) {
    this.nativeDriver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  }

  session(): GraphSession {
    const nativeSession = this.nativeDriver.session();
    return {
      async run(query: string, parameters?: Record<string, unknown>): Promise<GraphQueryResult> {
        const result = await nativeSession.run(query, parameters);
        const records: GraphRecord[] = result.records.map((rec) => ({
          get(key: string) {
            return rec.get(key);
          },
          toObject() {
            return rec.toObject();
          },
        }));
        return { records };
      },
      async close(): Promise<void> {
        await nativeSession.close();
      },
    };
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.nativeDriver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.nativeDriver.close();
  }
}
