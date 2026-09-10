import {
  CombatExplorerController,
  type ActiveExplorerTab,
} from "../features/combat-explorer/components/CombatExplorer.js";
import type { ApiClient } from "../shared/services/api-client.js";

export interface PageOptions {
  activeWorkspaceId?: string;
  initialTab?: ActiveExplorerTab;
  apiClient?: ApiClient;
}

export function createCombatExplorerPage(
  activeWorkspaceId = "ws-default",
  options: PageOptions = {}
) {
  const explorer = new CombatExplorerController({
    workspaceId: options.activeWorkspaceId ?? activeWorkspaceId,
    initialTab: options.initialTab ?? "explorer",
    apiClient: options.apiClient,
  });

  return explorer.renderLayout();
}

export function createCombatExplorerApp(
  activeWorkspaceId = "ws-default",
  options: PageOptions = {}
): CombatExplorerController {
  return new CombatExplorerController({
    workspaceId: options.activeWorkspaceId ?? activeWorkspaceId,
    initialTab: options.initialTab ?? "explorer",
    apiClient: options.apiClient,
  });
}
