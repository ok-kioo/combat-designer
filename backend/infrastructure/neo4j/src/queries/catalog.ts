import type { GraphDriver } from "../client/driver.js";

export interface CancelOptionItem {
  source_attack: string;
  target_attack_id: string;
  cancel_rule: Record<string, unknown>;
}

export interface LauncherPathItem {
  path: string[];
  launcher_attack_id: string;
  depth: number;
}

export interface CycleCandidateItem {
  cycle: string[];
  length: number;
}

export interface ImpactAnalysisResult {
  attack_id: string;
  affected_attacks: string[];
  total_connected_entities: number;
}

export interface ProvenanceResult {
  attack_id: string;
  provenance: Record<string, unknown>;
}

export interface ScenarioItem {
  scenario_id: string;
  properties: Record<string, unknown>;
}

function assertWorkspaceId(workspaceId: string): void {
  if (!workspaceId || typeof workspaceId !== "string" || workspaceId.trim() === "") {
    throw new Error("Invalid query: workspace_id is strictly mandatory for all graph queries.");
  }
}

/**
 * Q01 — Cancel options of a given attack in a workspace.
 */
export async function queryCancelOptions(
  driver: GraphDriver,
  workspaceId: string,
  attackId: string
): Promise<CancelOptionItem[]> {
  assertWorkspaceId(workspaceId);
  const session = driver.session();
  try {
    const query = `
      // Q01_CANCEL_OPTIONS
      MATCH (a:Attack {workspace_id: $workspace_id, attack_id: $attack_id})-[:HAS_CANCEL {workspace_id: $workspace_id}]->(c:CancelRule {workspace_id: $workspace_id})-[:CANCELS_TO {workspace_id: $workspace_id}]->(target:Attack {workspace_id: $workspace_id})
      RETURN a.attack_id AS source_attack, c AS cancel_rule, target.attack_id AS target_attack_id
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      attack_id: attackId,
    });

    return res.records.map((r) => ({
      source_attack: String(r.get("source_attack") || attackId),
      target_attack_id: String(
        r.get("target_attack_id") ||
          (r.get("target_attack") as any)?.attack_id ||
          (r.get("cancel_rule") as any)?.target_action ||
          ""
      ),
      cancel_rule: (r.get("cancel_rule") as Record<string, unknown>) || {},
    }));
  } finally {
    await session.close();
  }
}

/**
 * Q02 — Traversal paths leading to an attack with launcher hitbox.
 */
export async function queryPathsToLauncher(
  driver: GraphDriver,
  workspaceId: string,
  attackId: string,
  maxDepth = 5
): Promise<LauncherPathItem[]> {
  assertWorkspaceId(workspaceId);
  const clampedDepth = Math.min(Math.max(1, maxDepth), 10);
  const session = driver.session();
  try {
    const query = `
      // Q02_PATHS_TO_LAUNCHER
      MATCH path = (start:Attack {workspace_id: $workspace_id, attack_id: $attack_id})-[:HAS_CANCEL|CANCELS_TO*1..${clampedDepth}]->(launcher:Attack {workspace_id: $workspace_id})-[:HAS_HITBOX {workspace_id: $workspace_id}]->(hb:Hitbox {workspace_id: $workspace_id, launch: true})
      RETURN [node IN nodes(path) WHERE node:Attack | node.attack_id] AS path_attacks, launcher.attack_id AS launcher_id, length(path) AS depth
      LIMIT 50
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      attack_id: attackId,
      max_depth: clampedDepth,
    });

    return res.records.map((r) => ({
      path: (r.get("path") || r.get("path_attacks") || []) as string[],
      launcher_attack_id: String(r.get("launcher_attack_id") || r.get("launcher_id") || ""),
      depth: Number(r.get("depth") || 0),
    }));
  } finally {
    await session.close();
  }
}

/**
 * Q03 — Discovers candidate action cycles.
 * Note: Identifies structural cycles in the graph, does NOT conclude mechanical infinite combo.
 */
export async function queryCandidateCycles(
  driver: GraphDriver,
  workspaceId: string,
  maxDepth = 6,
  maxResults = 50
): Promise<CycleCandidateItem[]> {
  assertWorkspaceId(workspaceId);
  const clampedDepth = Math.min(Math.max(2, maxDepth), 10);
  const clampedResults = Math.min(Math.max(1, maxResults), 100);
  const session = driver.session();
  try {
    const query = `
      // Q03_CYCLES
      MATCH (start:Attack {workspace_id: $workspace_id})
      MATCH path = (start)-[:HAS_CANCEL|CANCELS_TO*2..${clampedDepth}]->(start)
      RETURN [node IN nodes(path) WHERE node:Attack | node.attack_id] AS cycle, length(path) AS length
      LIMIT ${clampedResults}
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      max_depth: clampedDepth,
      max_results: clampedResults,
    });

    return res.records.map((r) => ({
      cycle: (r.get("cycle") || []) as string[],
      length: Number(r.get("length") || 0),
    }));
  } finally {
    await session.close();
  }
}

/**
 * Q04 — Impact analysis for a modified attack.
 */
export async function queryImpactAnalysis(
  driver: GraphDriver,
  workspaceId: string,
  attackId: string
): Promise<ImpactAnalysisResult> {
  assertWorkspaceId(workspaceId);
  const session = driver.session();
  try {
    const query = `
      // Q04_IMPACT_ANALYSIS
      MATCH (a:Attack {workspace_id: $workspace_id, attack_id: $attack_id})
      OPTIONAL MATCH (a)-[r]-(connected {workspace_id: $workspace_id})
      RETURN a.attack_id AS attack_id, collect(DISTINCT connected.attack_id) AS affected_attacks, count(r) AS total_connected
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      attack_id: attackId,
    });

    if (res.records.length === 0) {
      return {
        attack_id: attackId,
        affected_attacks: [],
        total_connected_entities: 0,
      };
    }

    const rec = res.records[0];
    return {
      attack_id: attackId,
      affected_attacks: ((rec.get("affected_attacks") as string[]) || []).filter(Boolean),
      total_connected_entities: Number(rec.get("total_connected") || rec.get("total_connected_entities") || 0),
    };
  } finally {
    await session.close();
  }
}

/**
 * Q05 — Provenance query for an attack.
 */
export async function queryProvenance(
  driver: GraphDriver,
  workspaceId: string,
  attackId: string
): Promise<ProvenanceResult | null> {
  assertWorkspaceId(workspaceId);
  const session = driver.session();
  try {
    const query = `
      // Q05_PROVENANCE
      MATCH (a:Attack {workspace_id: $workspace_id, attack_id: $attack_id})-[:HAS_PROVENANCE {workspace_id: $workspace_id}]->(p:Provenance {workspace_id: $workspace_id})
      RETURN a.attack_id AS attack_id, p AS provenance
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      attack_id: attackId,
    });

    if (res.records.length === 0) {
      return null;
    }

    const rec = res.records[0];
    return {
      attack_id: attackId,
      provenance: (rec.get("provenance") as Record<string, unknown>) || {},
    };
  } finally {
    await session.close();
  }
}

/**
 * Q06 — Scenarios query scoped by workspace.
 */
export async function queryScenarios(
  driver: GraphDriver,
  workspaceId: string
): Promise<ScenarioItem[]> {
  assertWorkspaceId(workspaceId);
  const session = driver.session();
  try {
    const query = `
      // Q06_SCENARIOS
      MATCH (sc:Scenario {workspace_id: $workspace_id})
      RETURN sc.scenario_id AS scenario_id, sc AS properties
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
    });

    return res.records.map((r) => ({
      scenario_id: String(r.get("scenario_id") || ""),
      properties: (r.get("properties") as Record<string, unknown>) || {},
    }));
  } finally {
    await session.close();
  }
}
