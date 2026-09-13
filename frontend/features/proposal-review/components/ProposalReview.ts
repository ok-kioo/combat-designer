import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { ProposalView, ProposalReviewState, MutationDiffItem } from "../types/index.js";

export interface ProposalReviewProps {
  workspaceId: string;
  apiClient?: ApiClient;
  initialProposals?: any[];
  // CODE_LEGACY_PRODUCT_DIRECTION
  initialChangesets?: any[];
}

export class ProposalReviewController {
  public readonly workspaceId: string;
  private readonly apiClient: ApiClient;
  private state: ProposalReviewState;

  constructor(props: ProposalReviewProps) {
    this.workspaceId = props.workspaceId;
    this.apiClient = props.apiClient ?? defaultApiClient;
    const rawList = props.initialProposals ?? props.initialChangesets ?? [];
    this.state = {
      workspaceId: props.workspaceId,
      proposals: rawList.map((p) => this.mapProposal(p)),
      isLoading: false,
    };
    if (this.state.proposals.length > 0) {
      this.state.selectedProposalId = this.state.proposals[0].id;
    }
  }

  private mapProposal(raw: any): ProposalView {
    const id = raw.id || raw.proposal_id || raw.changeset_id || "prop_unknown";
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
      id,
      proposal_id: id,
      changeset_id: id,
      workspace_id: raw.workspace_id,
      base_revision: raw.base_revision,
      target_revision: raw.target_revision,
      proposed_by: raw.proposed_by,
      status: raw.status,
      mutations: raw.mutations || [],
      diffs,
      created_at: raw.created_at,
    };
  }

  public getState(): ProposalReviewState {
    return { ...this.state };
  }

  public async loadProposals(): Promise<ProposalView[]> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const data = await this.apiClient.getProposals(this.workspaceId);
      const rawList = data.proposals || data.changesets || [];
      this.state.proposals = rawList.map((p: any) => this.mapProposal(p));
      if (!this.state.selectedProposalId && this.state.proposals.length > 0) {
        this.state.selectedProposalId = this.state.proposals[0].id;
      }
      this.state.isLoading = false;
      return this.state.proposals;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Failed to load proposals";
      return [];
    }
  }

  // CODE_LEGACY_PRODUCT_DIRECTION: Backward compatibility alias
  public async loadChangeSets(): Promise<ProposalView[]> {
    return this.loadProposals();
  }

  public selectProposal(id: string): void {
    this.state.selectedProposalId = id;
  }

  // CODE_LEGACY_PRODUCT_DIRECTION: Backward compatibility alias
  public selectChangeset(id: string): void {
    this.selectProposal(id);
  }

  public getSelectedProposal(): ProposalView | undefined {
    return this.state.proposals.find((p) => p.id === this.state.selectedProposalId);
  }

  // CODE_LEGACY_PRODUCT_DIRECTION: Backward compatibility alias
  public getSelectedChangeset(): ProposalView | undefined {
    return this.getSelectedProposal();
  }

  public async withdrawProposal(id: string, reason?: string): Promise<ProposalView> {
    this.state.isLoading = true;
    this.state.error = undefined;
    try {
      const res = await this.apiClient.withdrawProposal(this.workspaceId, id, reason);
      const updated = this.mapProposal(res.proposal || res.changeset || res);
      const idx = this.state.proposals.findIndex((p) => p.id === id);
      if (idx >= 0) {
        this.state.proposals[idx] = updated;
      }
      this.state.actionStatus = `Proposal '${id}' withdrawn.`;
      this.state.isLoading = false;
      return updated;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Withdrawal failed";
      throw err;
    }
  }

  // CODE_LEGACY_PRODUCT_DIRECTION: Backward compatibility alias
  public async withdrawChangeset(id: string, reason?: string): Promise<ProposalView> {
    return this.withdrawProposal(id, reason);
  }

  public renderModel() {
    const selected = this.getSelectedProposal();
    return {
      column: "left" as const,
      view: "proposals" as const,
      workspaceId: this.workspaceId,
      totalCount: this.state.proposals.length,
      selectedProposalId: this.state.selectedProposalId,
      selectedProposal: selected ?? null,
      proposals: this.state.proposals.map((p) => ({
        id: p.id,
        targetRevision: p.target_revision,
        status: p.status,
        proposedBy: p.proposed_by,
        mutationsCount: p.mutations.length,
        isSelected: p.id === this.state.selectedProposalId,
      })),
      actionStatus: this.state.actionStatus,
      isLoading: this.state.isLoading,
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const sel = model.selectedProposal;

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
      <section class="proposal-review" data-workspace="${model.workspaceId}">
        <header class="review-header">
          <h2>Suggested Adjustments & Proposals (${model.totalCount})</h2>
          ${model.actionStatus ? `<div class="alert alert-info">${model.actionStatus}</div>` : ""}
        </header>

        <div class="review-grid">
          <div class="proposals-sidebar">
            <h3>Proposals</h3>
            <ul class="proposal-nav">
              ${model.proposals
                .map(
                  (p) => `
                <li class="${p.isSelected ? "active" : ""}">
                  <a href="#${p.id}">
                    <strong>${p.id}</strong> [${p.status}]
                    <small>→ ${p.targetRevision} (${p.mutationsCount} mutations)</small>
                  </a>
                </li>`
                )
                .join("\n")}
            </ul>
          </div>

          <div class="proposal-details">
            ${
              sel
                ? `
              <div class="proposal-card">
                <h3>Proposal: <code>${sel.id}</code></h3>
                <div class="meta-row">
                  <span class="badge badge-${sel.status}">${sel.status}</span>
                  <span>Proposed by: <strong>${sel.proposed_by}</strong></span>
                  <span>Base: <code>${sel.base_revision}</code> → Target: <code>${sel.target_revision}</code></span>
                </div>

                <h4>Suggested Adjustments</h4>
                <div class="diff-container">
                  ${diffRows}
                </div>

                <div class="review-actions">
                  ${
                    sel.status !== "withdrawn"
                      ? `<button class="btn btn-danger" id="btn-withdraw-proposal" data-id="${sel.id}">Withdraw Proposal</button>`
                      : `<span class="muted">Proposal has been withdrawn.</span>`
                  }
                </div>
              </div>`
                : `<div class="empty-state">Select a proposal from the list to review adjustments.</div>`
            }
          </div>
        </div>
      </section>
    `;
  }
}

// CODE_LEGACY_PRODUCT_DIRECTION: Backward compatibility alias
export const ChangeSetReviewController = ProposalReviewController;
export type ChangeSetReviewProps = ProposalReviewProps;
