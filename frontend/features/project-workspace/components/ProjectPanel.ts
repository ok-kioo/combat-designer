import type { WorkspaceProjectState, IngestionStatusSummary, GateHistoryEntry } from "../types/index.js";

export interface ProjectPanelProps {
  workspaceId: string;
  initialState?: Partial<WorkspaceProjectState>;
  onUploadBundle?: (bundleData: { manifest: unknown; files: Record<string, string> }) => Promise<{
    status: string;
    snapshot_hash: string;
    summary: IngestionStatusSummary;
  }>;
}

export class ProjectPanelController {
  public readonly workspaceId: string;
  private state: WorkspaceProjectState;

  constructor(props: ProjectPanelProps) {
    this.workspaceId = props.workspaceId;
    this.state = {
      workspaceId: props.workspaceId,
      projectId: props.initialState?.projectId ?? "default_project",
      revisionLabel: props.initialState?.revisionLabel ?? "uncommitted",
      snapshotHash: props.initialState?.snapshotHash ?? "empty",
      ingestionStatus: props.initialState?.ingestionStatus ?? {
        processed: 0,
        quarantined: 0,
        conflicts: 0,
      },
      history: props.initialState?.history ?? [],
    };
  }

  public getState(): WorkspaceProjectState {
    return { ...this.state };
  }

  public async uploadBundle(bundleData: { manifest: any; files: Record<string, string> }): Promise<{
    success: boolean;
    status: string;
    snapshotHash?: string;
    error?: string;
  }> {
    // Invariant: Backend HTTP upload endpoint is the exclusive ingestion gateway.
    // Zero direct writes to canonical domain or simulation state occur here.
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/bundles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-authorized-workspaces": this.workspaceId,
        },
        body: JSON.stringify(bundleData),
      });

      const body = await response.json();

      if (!response.ok) {
        return {
          success: false,
          status: body.status || "ERROR",
          error: body.details || body.message || `HTTP ${response.status}`,
        };
      }

      this.state.snapshotHash = body.snapshot_hash;
      this.state.revisionLabel = body.revision || this.state.revisionLabel;
      this.state.projectId = body.project_id || this.state.projectId;
      this.state.ingestionStatus = {
        processed: body.summary?.processed ?? 0,
        quarantined: body.summary?.quarantined ?? 0,
        conflicts: body.summary?.conflicts ?? 0,
      };

      return {
        success: true,
        status: "SUCCESS",
        snapshotHash: body.snapshot_hash,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: "NETWORK_ERROR",
        error: message,
      };
    }
  }

  public addHistoryEntry(entry: GateHistoryEntry): void {
    this.state.history.unshift(entry);
  }

  public renderModel() {
    return {
      column: "left" as const,
      workspaceId: this.workspaceId,
      projectId: this.state.projectId,
      revision: this.state.revisionLabel,
      snapshotHash: this.state.snapshotHash,
      ingestion: {
        processedCount: this.state.ingestionStatus.processed,
        quarantinedCount: this.state.ingestionStatus.quarantined,
        conflictsCount: this.state.ingestionStatus.conflicts,
      },
      historyCount: this.state.history.length,
      history: this.state.history,
    };
  }
}
