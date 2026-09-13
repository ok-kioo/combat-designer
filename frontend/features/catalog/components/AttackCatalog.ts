import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { AttackItem, CatalogFilter, CatalogState } from "../types/index.js";

export interface AttackCatalogProps {
  workspaceId: string;
  apiClient?: ApiClient;
  initialAttacks?: AttackItem[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

export class AttackCatalogController {
  public readonly workspaceId: string;
  private readonly apiClient: ApiClient;
  private state: CatalogState;
  private onSelectionChange?: (selectedIds: string[]) => void;

  constructor(props: AttackCatalogProps) {
    this.workspaceId = props.workspaceId;
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.onSelectionChange = props.onSelectionChange;
    this.state = {
      workspaceId: props.workspaceId,
      attacks: props.initialAttacks ?? [],
      selectedAttackIds: [],
      filter: {},
      isLoading: false,
    };
  }

  public getState(): CatalogState {
    return { ...this.state };
  }

  public async loadAttacks(filter?: CatalogFilter): Promise<AttackItem[]> {
    this.state.isLoading = true;
    this.state.error = undefined;
    if (filter) {
      this.state.filter = { ...this.state.filter, ...filter };
    }

    try {
      const data = await this.apiClient.getAttacks(this.workspaceId, {
        query: this.state.filter.query,
        tag: this.state.filter.tag,
        min_cancel_window: this.state.filter.minCancelWindow,
      });

      this.state.attacks = data.attacks.map((a: any) => ({
        attack_id: a.attack_id,
        name: a.name,
        character_id: a.character_id ?? null,
        assignment_status: a.assignment_status ?? (a.character_id ? "ASSIGNED" : "UNASSIGNED"),
        startup_frames: a.startup_frames,
        active_frames: a.active_frames,
        recovery_frames: a.recovery_frames,
        damage: a.damage,
        cancel_window: a.cancel_window,
        tags: a.tags,
        untrusted_text: Boolean(a.untrusted_text),
      }));
      this.state.isLoading = false;
      return this.state.attacks;
    } catch (err: any) {
      this.state.isLoading = false;
      this.state.error = err?.message || "Failed to load attacks";
      return [];
    }
  }

  public toggleSelectAttack(attackId: string): string[] {
    const idx = this.state.selectedAttackIds.indexOf(attackId);
    if (idx >= 0) {
      this.state.selectedAttackIds.splice(idx, 1);
    } else {
      this.state.selectedAttackIds.push(attackId);
    }
    this.onSelectionChange?.(this.state.selectedAttackIds);
    return [...this.state.selectedAttackIds];
  }

  public selectAttack(attackId: string): void {
    if (!this.state.selectedAttackIds.includes(attackId)) {
      this.state.selectedAttackIds.push(attackId);
      this.onSelectionChange?.(this.state.selectedAttackIds);
    }
  }

  public clearSelection(): void {
    this.state.selectedAttackIds = [];
    this.onSelectionChange?.([]);
  }

  public getSelectedAttacks(): AttackItem[] {
    return this.state.attacks.filter((a) => this.state.selectedAttackIds.includes(a.attack_id));
  }

  public renderModel() {
    return {
      column: "left" as const,
      view: "catalog" as const,
      workspaceId: this.workspaceId,
      totalCount: this.state.attacks.length,
      selectedCount: this.state.selectedAttackIds.length,
      selectedAttackIds: [...this.state.selectedAttackIds],
      filter: { ...this.state.filter },
      attacks: this.state.attacks.map((a) => ({
        ...a,
        total_duration: a.startup_frames + a.active_frames + a.recovery_frames,
        isSelected: this.state.selectedAttackIds.includes(a.attack_id),
      })),
      isLoading: this.state.isLoading,
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const rows = model.attacks
      .map(
        (a) => `
        <tr class="attack-row ${a.isSelected ? "selected" : ""}" data-attack-id="${a.attack_id}">
          <td><input type="checkbox" ${a.isSelected ? "checked" : ""} aria-label="Select ${a.name}" /></td>
          <td><strong>${a.name}</strong> ${a.untrusted_text ? `<span class="badge untrusted">untrusted</span>` : ""}</td>
          <td>${a.startup_frames}f</td>
          <td>${a.active_frames}f</td>
          <td>${a.recovery_frames}f</td>
          <td>${a.total_duration}f</td>
          <td>${a.damage}</td>
          <td>${a.cancel_window ? `${a.cancel_window.start_frame}f-${a.cancel_window.end_frame}f` : "-"}</td>
          <td>${a.tags?.join(", ") ?? "-"}</td>
        </tr>`
      )
      .join("\n");

    return `
      <section class="attack-catalog" data-workspace="${model.workspaceId}">
        <header class="catalog-header">
          <h2>Attack Catalog (${model.totalCount})</h2>
          <div class="selection-actions">
            <span>Selected for LLM Context: <strong>${model.selectedCount}</strong></span>
          </div>
        </header>
        <table class="catalog-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Name</th>
              <th>Startup</th>
              <th>Active</th>
              <th>Recovery</th>
              <th>Total</th>
              <th>Damage</th>
              <th>Cancel Window</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    `;
  }
}
