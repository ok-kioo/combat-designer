import type { CanonicalCombatSnapshot } from "@combat-designer/backend";
import type { GraphDriver } from "./client/driver.js";
import {
  initializeGraphSchema,
  projectCanonicalSnapshot,
  type ProjectorOptions,
  type ProjectionSummary,
} from "./projector/projector.js";
import {
  checkProjectionStatus,
  type ProjectionStatusResult,
} from "./status/stale-detector.js";
import {
  queryCancelOptions,
  queryPathsToLauncher,
  queryCandidateCycles,
  queryImpactAnalysis,
  queryProvenance,
  queryScenarios,
  type CancelOptionItem,
  type LauncherPathItem,
  type CycleCandidateItem,
  type ImpactAnalysisResult,
  type ProvenanceResult,
  type ScenarioItem,
} from "./queries/catalog.js";

export interface GraphAdapter {
  initializeSchema(): Promise<void>;
  projectSnapshot(
    snapshot: CanonicalCombatSnapshot,
    options?: ProjectorOptions
  ): Promise<ProjectionSummary>;
  getProjectionStatus(
    workspaceId: string,
    projectId: string,
    snapshotHash: string
  ): Promise<ProjectionStatusResult>;
  getCancelOptions(
    workspaceId: string,
    attackId: string
  ): Promise<CancelOptionItem[]>;
  getPathsToLauncher(
    workspaceId: string,
    attackId: string,
    maxDepth?: number
  ): Promise<LauncherPathItem[]>;
  getCandidateCycles(
    workspaceId: string,
    maxDepth?: number,
    maxResults?: number
  ): Promise<CycleCandidateItem[]>;
  getImpactAnalysis(
    workspaceId: string,
    attackId: string
  ): Promise<ImpactAnalysisResult>;
  getProvenance(
    workspaceId: string,
    attackId: string
  ): Promise<ProvenanceResult | null>;
  getScenarios(workspaceId: string): Promise<ScenarioItem[]>;
  close(): Promise<void>;
}

export class DefaultGraphAdapter implements GraphAdapter {
  constructor(private driver: GraphDriver) {}

  async initializeSchema(): Promise<void> {
    await initializeGraphSchema(this.driver);
  }

  async projectSnapshot(
    snapshot: CanonicalCombatSnapshot,
    options?: ProjectorOptions
  ): Promise<ProjectionSummary> {
    return projectCanonicalSnapshot(this.driver, snapshot, options);
  }

  async getProjectionStatus(
    workspaceId: string,
    projectId: string,
    snapshotHash: string
  ): Promise<ProjectionStatusResult> {
    return checkProjectionStatus(this.driver, workspaceId, projectId, snapshotHash);
  }

  async getCancelOptions(
    workspaceId: string,
    attackId: string
  ): Promise<CancelOptionItem[]> {
    return queryCancelOptions(this.driver, workspaceId, attackId);
  }

  async getPathsToLauncher(
    workspaceId: string,
    attackId: string,
    maxDepth?: number
  ): Promise<LauncherPathItem[]> {
    return queryPathsToLauncher(this.driver, workspaceId, attackId, maxDepth);
  }

  async getCandidateCycles(
    workspaceId: string,
    maxDepth?: number,
    maxResults?: number
  ): Promise<CycleCandidateItem[]> {
    return queryCandidateCycles(this.driver, workspaceId, maxDepth, maxResults);
  }

  async getImpactAnalysis(
    workspaceId: string,
    attackId: string
  ): Promise<ImpactAnalysisResult> {
    return queryImpactAnalysis(this.driver, workspaceId, attackId);
  }

  async getProvenance(
    workspaceId: string,
    attackId: string
  ): Promise<ProvenanceResult | null> {
    return queryProvenance(this.driver, workspaceId, attackId);
  }

  async getScenarios(workspaceId: string): Promise<ScenarioItem[]> {
    return queryScenarios(this.driver, workspaceId);
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
