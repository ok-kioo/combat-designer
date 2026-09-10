import { CombatExplorerController } from "../features/combat-explorer/components/CombatExplorer.js";

export function createCombatExplorerPage(activeWorkspaceId: string = "ws-default") {
  const explorer = new CombatExplorerController({
    workspaceId: activeWorkspaceId,
  });

  return explorer.renderLayout();
}
