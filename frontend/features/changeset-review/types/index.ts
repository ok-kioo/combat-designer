export interface MutationDiffItem {
  type: string;
  attack_id: string;
  field: string;
  current_value: any;
  proposed_value: any;
  reason: string;
}

export interface ChangeSetProposalView {
  changeset_id: string;
  workspace_id: string;
  base_revision: string;
  target_revision: string;
  proposed_by: string;
  status: "proposed" | "simulated" | "verified" | "approved" | "applied" | "withdrawn" | "rejected";
  mutations: any[];
  diffs: MutationDiffItem[];
  approved_by?: string | null;
  approved_at?: string | null;
  applied_at?: string | null;
  created_at: string;
}

export interface ChangeSetReviewState {
  workspaceId: string;
  changesets: ChangeSetProposalView[];
  selectedChangesetId?: string;
  isLoading: boolean;
  actionStatus?: string;
  error?: string;
}
