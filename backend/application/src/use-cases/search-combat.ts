import type { CombatQueryPort, CombatSearchFilter, AttackSummary } from "../ports/combat-query-port.js";
import { McpError } from "@combat-designer/shared-contracts";

export async function searchCombatUseCase(
  queryPort: CombatQueryPort,
  filter: CombatSearchFilter
): Promise<AttackSummary[]> {
  if (!filter.workspace_id || filter.workspace_id.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required for search.");
  }
  return await queryPort.searchAttacks(filter);
}
