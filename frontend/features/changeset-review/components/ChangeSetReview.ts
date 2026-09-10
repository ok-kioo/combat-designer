import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { ChangeSetProposalView, ChangeSetReviewState, MutationDiffItem } from "../types/index.js";

export interface ChangeSetReviewProps {
  workspaceId: string;
  apiClient?: ApiClient;
  initialChangesets?: any[];
}

export class ChangeSetReviewController {
  public readonly workspaceId: string;
  private readonly apiClient: ApiClient;
  private state: ChangeSetReviewState;

  constructor(props: ChangeSetReviewProps) {
    this.workspaceId = props.workspaceId;
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.state = {
      workspaceId: props.workspaceId,
      changesets: (props.initialChangesets ?? []).map((cs) => this.mapProposal(cs)),
      isLoading: false,
    };
    if (this.state.changesets.length > 0) {
      this.state.selectedChangesetId = this.state.changesets[0].changeset_id;
    }
  }

  private mapProposal(raw: any): ChangeSetProposalView {
    const diffs: MutationDiffItem[] = (raw.mutations || []).map((m: any) => {
      if (m.type === "attack_damage") {
        return {
          type: m.type,
          attack_id: m.attack_id,
          field: "damage",
          current_value: m.current_damage,
          proposed_value: m.proposed_damage,
          reason: m.reason,
        };
      }
      if (m.type === "attack_recovery") {
        return {
          type: m.type,
          attack_id: m.attack_id,
          field: "recovery_frames",
          current_value: m.current_recovery_frames,
          proposed_value: m.proposed_recovery_frames,
          reason: m.reason,
        };
      }
      return {
        type: m.type,
        attack_id: m.attack_id || "unknown",
        field: "custom",
        current_value: m.current_window || m.current_cost || "-",
        proposed_value: m.proposed_window || m.proposed_cost || "-",
        reason: m.reason || "",
      };
    });

    return {
      changeset_id: raw.changeset_id,
      workspace_id: raw.workspace_id,
      base_revision: raw.base_revision,
      target_revision: raw.target_revision,
      proposed_by: raw.proposed_by,
      status: raw.status,
      mutations: raw.mutations || [],
      diffs,
      approved_by: raw.approved_by,
      approved_at: raw.approved_at,
      applied_at: raw.applied_at,
      created_at: raw.created_at,
    };
  }

  public getState(): ChangeSetReviewState {
    return { ...this.state };
  }

  public async loadChangeSets(): Promise<ChangeSetProposalView[]> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const data = await this.apiClient.getChangeSets(this.workspaceId);
      this.state.changesets = (data.changesets || []).map((cs) => this.mapProposal(cs));
      if (!this.state.selectedChangesetId && this.state.changesets.length > 0) {
        this.state.selectedChangesetId = this.state.changesets[0].changeset_id;
      }
      this.state.isLoading = false;
      return this.state.changesets;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Failed to load changesets";
      return [];
    }
  }

  public selectChangeset(id: string): void {
    this.state.selectedChangesetId = id;
  }

  public getSelectedChangeset(): ChangeSetProposalView | undefined {
    return this.state.changesets.find((c) => c.changeset_id === this.state.selectedChangesetId);
  }

  public async approveChangeset(id: string, approverId = "human_lead"): Promise<ChangeSetProposalView> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const res = await this.apiClient.approveChangeSet(this.workspaceId, id, approverId);
      const updated = this.mapProposal(res.changeset);
      const idx = this.state.changesets.findIndex((c) => c.changeset_id === id);
      if (idx >= 0) {
        this.state.changesets[idx] = updated;
      }
      this.state.actionStatus = `ChangeSet '${id}' approved successfully.`;
      this.state.isLoading = false;
      return updated;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Approval failed";
      throw err;
    }
  }

  public async applyChangeset(id: string, gateResult: any): Promise<ChangeSetProposalView> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const res = await this.apiClient.applyChangeSet(this.workspaceId, id, gateResult);
      const updated = this.mapProposal(res.changeset);
      const idx = this.state.changesets.findIndex((c) => c.changeset_id === id);
      if (idx >= 0) {
        this.state.changesets[idx] = updated;
      }
      this.state.actionStatus = `ChangeSet '${id}' applied to canonical state.`;
      this.state.isLoading = false;
      return updated;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Application failed";
      throw err;
    }
  }

  public async withdrawChangeset(id: string, reason?: string): Promise<ChangeSetProposalView> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const res = await this.apiClient.withdrawChangeSet(this.workspaceId, id, reason);
      const updated = this.mapProposal(res.changeset);
      const idx = this.state.changesets.findIndex((c) => c.changeset_id === id);
      if (idx >= 0) {
        this.state.changesets[idx] = updated;
      }
      this.state.actionStatus = `ChangeSet '${id}' withdrawn.`;
      this.state.isLoading = false;
      return updated;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Withdrawal failed";
      throw err;
    }
  }

  public renderModel() {
    const selected = this.getSelectedChangeset();
    return {
      column: "left" as const,
      view: "changesets" as const,
      workspaceId: this.workspaceId,
      totalCount: this.state.changesets.length,
      selectedChangesetId: this.state.selectedChangesetId,
      selectedChangeset: selected ?? null,
      changesets: this.state.changesets.map((c) => ({
        id: c.changeset_id,
        targetRevision: c.target_revision,
        status: c.status,
        proposedBy: c.proposed_by,
        mutationsCount: c.mutations.length,
        isSelected: c.changeset_id === this.state.selectedChangesetId,
      })),
      actionStatus: this.state.actionStatus,
      isLoading: this.state.isLoading,
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const sel = model.selectedChangeset;

    const diffRows = sel?.diffs
      .map(
        (d) => `
        <div class="diff-row">
          <span class="attack-tag">${d.attack_id}</span>
          <span class="field-tag">${d.field}:</span>
          <span class="diff-before">${JSON.stringify(d.current_value)}</span>
          <span class="diff-arrow">→</span>
          <span class="diff-after">${JSON.stringify(d.proposed_value)}</span>
          <p class="diff-reason"><em>Reason:</em> ${d.reason}</p>
        </div>`
      )
      .join("\n") ?? "<p>No mutations in proposal.</p>";

    return `
      <section class="changeset-review" data-workspace="${model.workspaceId}">
        <header class="review-header">
          <h2>ChangeSet Review (${model.totalCount})</h2>
          ${model.actionStatus ? `<div class="alert alert-info">${model.actionStatus}</div>` : ""}
        </header>

        <div class="review-grid">
          <div class="changesets-sidebar">
            <h3>Proposals</h3>
            <ul class="changeset-nav">
              ${model.changesets
                .map(
                  (c) => `
                <li class="${c.isSelected ? "active" : ""}">
                  <a href="#${c.id}">
                    <strong>${c.id}</strong> [${c.status}]
                    <small>→ ${c.targetRevision} (${c.mutationsCount} mutations)</small>
                  </a>
                </li>`
                )
                .join("\n")}
            </ul>
          </div>

          <div class="changeset-detail-panel">
            ${
              sel
                ? `<h3>Proposal: ${sel.changeset_id}</h3>
                   <p><strong>Status:</strong> <span class="badge badge-${sel.status}">${sel.status}</span></p>
                   <p><strong>Target Revision:</strong> ${sel.target_revision}</p>
                   <p><strong>Proposed By:</strong> ${sel.proposed_by}</p>
                   <div class="diff-container">
                     <h4>Mutations</h4>
                     ${diffRows}
                   </div>
                   <div class="action-bar">
                     <button class="btn btn-success" id="btn-approve" ${sel.status !== "proposed" ? "disabled" : ""}>Approve</button>
                     <button class="btn btn-primary" id="btn-apply" ${sel.status !== "approved" ? "disabled" : ""}>Apply to Canonical</button>
                     <button class="btn btn-danger" id="btn-withdraw" ${sel.status === "applied" ? "disabled" : ""}>Withdraw</button>
                   </div>`
                : `<p class="empty-state">Select a changeset to review.</p>`
            }
          </div>
        </div>
      </section>
    `;
  }
}
