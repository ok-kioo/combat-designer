export interface MutationDiffItem {
  type: string;
  attack_id: string;
  field: string;
  current_value: any;
  proposed_value: any;
  reason: string;
}

export interface ProposalView {
  id: string;
  proposal_id: string;
  changeset_id?: string;
  workspace_id: string;
  base_revision: string;
  target_revision: string;
  proposed_by: string;
  status: "proposed" | "simulated" | "verified" | "withdrawn" | "rejected";
  mutations: any[];
  diffs: MutationDiffItem[];
  created_at: string;
}

// CODE_LEGACY_PRODUCT_DIRECTION: Retained for backward migration compatibility
export type ChangeSetProposalView = ProposalView;

export interface ProposalReviewState {
  workspaceId: string;
  proposals: ProposalView[];
  selectedProposalId?: string;
  isLoading: boolean;
  actionStatus?: string;
  error?: string;
}

// CODE_LEGACY_PRODUCT_DIRECTION: Retained for backward migration compatibility
export type ChangeSetReviewState = ProposalReviewState & {
  changesets?: ProposalView[];
  selectedChangesetId?: string;
};
