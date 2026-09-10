export interface IngestionStatusSummary {
  processed: number;
  quarantined: number;
  conflicts: number;
  quarantinedDetails?: Array<{ assetId: string; reason: string }>;
  conflictDetails?: Array<{ conflictType: string; details: string }>;
}

export interface GateHistoryEntry {
  type: "simulation" | "gate_run";
  id: string;
  verdict?: "PASS" | "FAIL" | "BLOCKED" | "STALE";
  timestamp: string;
}

export interface WorkspaceProjectState {
  workspaceId: string;
  projectId: string;
  revisionLabel: string;
  snapshotHash: string;
  ingestionStatus: IngestionStatusSummary;
  history: GateHistoryEntry[];
}
