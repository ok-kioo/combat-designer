export interface AttackItem {
  attack_id: string;
  name: string;
  startup_frames: number;
  active_frames: number;
  recovery_frames: number;
  damage: number;
  cancel_window?: {
    start_frame: number;
    end_frame: number;
  };
  tags?: string[];
  untrusted_text?: boolean;
}

export interface CatalogFilter {
  query?: string;
  tag?: string;
  minCancelWindow?: number;
}

export interface CatalogState {
  workspaceId: string;
  attacks: AttackItem[];
  selectedAttackIds: string[];
  filter: CatalogFilter;
  isLoading: boolean;
  error?: string;
}
