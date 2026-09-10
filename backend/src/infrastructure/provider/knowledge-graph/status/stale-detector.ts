import type { GraphDriver } from "../client/driver.js";
import { GRAPH_SCHEMA_VERSION, PROJECTOR_VERSION } from "../schema/schema.js";

export type ProjectionState = "CURRENT" | "STALE" | "NOT_FOUND" | "ERROR";

export interface ProjectionStatusResult {
  state: ProjectionState;
  workspace_id: string;
  project_id: string;
  revision?: string;
  snapshot_id?: string;
  current_snapshot_hash: string;
  projected_snapshot_hash?: string;
  graph_schema_version?: string;
  projector_version?: string;
  details: string;
}

export async function checkProjectionStatus(
  driver: GraphDriver,
  workspaceId: string,
  projectId: string,
  currentSnapshotHash: string
): Promise<ProjectionStatusResult> {
  const session = driver.session();
  try {
    const query = `
      MATCH (m:ProjectionMetadata {workspace_id: $workspace_id, project_id: $project_id})
      RETURN m
    `;
    const res = await session.run(query, {
      workspace_id: workspaceId,
      project_id: projectId,
    });

    if (res.records.length === 0) {
      return {
        state: "NOT_FOUND",
        workspace_id: workspaceId,
        project_id: projectId,
        current_snapshot_hash: currentSnapshotHash,
        details: "No projection metadata found for this workspace and project",
      };
    }

    const metadata = res.records[0].get("m") as Record<string, unknown>;
    const projectedHash = String(metadata.snapshot_hash || "");
    const schemaVer = String(metadata.graph_schema_version || "");
    const projVer = String(metadata.projector_version || "");
    const status = String(metadata.status || "");

    if (status === "ERROR") {
      return {
        state: "ERROR",
        workspace_id: workspaceId,
        project_id: projectId,
        revision: String(metadata.revision || ""),
        snapshot_id: String(metadata.snapshot_id || ""),
        current_snapshot_hash: currentSnapshotHash,
        projected_snapshot_hash: projectedHash,
        graph_schema_version: schemaVer,
        projector_version: projVer,
        details: "Last projection failed with status ERROR",
      };
    }

    if (projectedHash !== currentSnapshotHash) {
      return {
        state: "STALE",
        workspace_id: workspaceId,
        project_id: projectId,
        revision: String(metadata.revision || ""),
        snapshot_id: String(metadata.snapshot_id || ""),
        current_snapshot_hash: currentSnapshotHash,
        projected_snapshot_hash: projectedHash,
        graph_schema_version: schemaVer,
        projector_version: projVer,
        details: `Snapshot hash mismatch: current '${currentSnapshotHash}' != projected '${projectedHash}'`,
      };
    }

    if (schemaVer !== GRAPH_SCHEMA_VERSION) {
      return {
        state: "STALE",
        workspace_id: workspaceId,
        project_id: projectId,
        revision: String(metadata.revision || ""),
        snapshot_id: String(metadata.snapshot_id || ""),
        current_snapshot_hash: currentSnapshotHash,
        projected_snapshot_hash: projectedHash,
        graph_schema_version: schemaVer,
        projector_version: projVer,
        details: `Graph schema drift: server schema '${GRAPH_SCHEMA_VERSION}' != projected schema '${schemaVer}'`,
      };
    }

    return {
      state: "CURRENT",
      workspace_id: workspaceId,
      project_id: projectId,
      revision: String(metadata.revision || ""),
      snapshot_id: String(metadata.snapshot_id || ""),
      current_snapshot_hash: currentSnapshotHash,
      projected_snapshot_hash: projectedHash,
      graph_schema_version: schemaVer,
      projector_version: projVer,
      details: "Graph projection is current and matches canonical snapshot",
    };
  } finally {
    await session.close();
  }
}
