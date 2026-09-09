import type { CombatQueryPort, AttackSummary } from "../ports/combat-query-port.js";
import { McpError } from "@combat-designer/shared-contracts";

export async function getAttackUseCase(
  queryPort: CombatQueryPort,
  workspaceId: string,
  attackId: string
): Promise<AttackSummary | null> {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new McpError("WORKSPACE_REQUIRED", "workspace_id is strictly required.");
  }
  if (!attackId || attackId.trim() === "") {
    throw new McpError("INVALID_REQUEST", "attack_id is strictly required.");
  }
  return await queryPort.getAttack(workspaceId, attackId);
}
