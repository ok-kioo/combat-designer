import { z } from "zod";
import type { Capability, CanonicalToolName, ResponseClassification } from "@combat-designer/backend";
import {
  resolveCanonicalToolName,
  CombatSearchInputSchema,
  CombatGetAttackInputSchema,
  ListScenariosInputSchema,
  ImpactAnalysisInputSchema,
  CombatSimulateInputSchema,
  CombatAnalyzeInputSchema,
  CombatProposeChangeInputSchema,
  CombatGetChangeInputSchema,
  CombatWithdrawChangeInputSchema,
} from "@combat-designer/backend";

export type Mutability = "READ" | "READ_SIMULATION" | "READ_ANALYSIS" | "PROPOSAL";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type { ResponseClassification };

export interface ToolRegistration {
  tool_id: CanonicalToolName;
  capability_required: Capability;
  workspace_required: boolean;
  mutability: Mutability;
  gate_required: boolean;
  risk_level: RiskLevel;
  input_schema: z.ZodTypeAny;
  output_classification: ResponseClassification;
}

export class ToolRegistry {
  private tools = new Map<CanonicalToolName, ToolRegistration>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register({
      tool_id: "combat_search",
      capability_required: "combat:query",
      workspace_required: true,
      mutability: "READ",
      gate_required: false,
      risk_level: "low",
      input_schema: CombatSearchInputSchema,
      output_classification: "FACT",
    });

    this.register({
      tool_id: "combat_get_attack",
      capability_required: "combat:read",
      workspace_required: true,
      mutability: "READ",
      gate_required: false,
      risk_level: "low",
      input_schema: CombatGetAttackInputSchema,
      output_classification: "FACT",
    });

    this.register({
      tool_id: "list_scenarios",
      capability_required: "combat:read",
      workspace_required: true,
      mutability: "READ",
      gate_required: false,
      risk_level: "low",
      input_schema: ListScenariosInputSchema,
      output_classification: "FACT",
    });

    this.register({
      tool_id: "impact_analysis",
      capability_required: "combat:query",
      workspace_required: true,
      mutability: "READ",
      gate_required: false,
      risk_level: "low",
      input_schema: ImpactAnalysisInputSchema,
      output_classification: "FACT",
    });

    this.register({
      tool_id: "combat_simulate",
      capability_required: "combat:simulate",
      workspace_required: true,
      mutability: "READ_SIMULATION",
      gate_required: false,
      risk_level: "medium",
      input_schema: CombatSimulateInputSchema,
      output_classification: "SIMULATION_RESULT",
    });

    this.register({
      tool_id: "combat_analyze",
      capability_required: "combat:analyze",
      workspace_required: true,
      mutability: "READ_ANALYSIS",
      gate_required: false,
      risk_level: "medium",
      input_schema: CombatAnalyzeInputSchema,
      output_classification: "SIMULATION_RESULT",
    });

    this.register({
      tool_id: "combat_propose_change",
      capability_required: "combat:propose",
      workspace_required: true,
      mutability: "PROPOSAL",
      gate_required: false,
      risk_level: "medium",
      input_schema: CombatProposeChangeInputSchema,
      output_classification: "SUGGESTION",
    });

    this.register({
      tool_id: "combat_get_change",
      capability_required: "combat:read",
      workspace_required: true,
      mutability: "READ",
      gate_required: false,
      risk_level: "low",
      input_schema: CombatGetChangeInputSchema,
      output_classification: "FACT",
    });

    this.register({
      tool_id: "combat_withdraw_change",
      capability_required: "changeset:withdraw",
      workspace_required: true,
      mutability: "PROPOSAL",
      gate_required: false,
      risk_level: "medium",
      input_schema: CombatWithdrawChangeInputSchema,
      output_classification: "SUGGESTION",
    });
  }

  register(tool: ToolRegistration): void {
    this.tools.set(tool.tool_id, tool);
  }

  resolveTool(nameOrAlias: string): ToolRegistration | null {
    const canonicalName = resolveCanonicalToolName(nameOrAlias) as CanonicalToolName;
    return this.tools.get(canonicalName) ?? null;
  }

  getAllTools(): ToolRegistration[] {
    return Array.from(this.tools.values());
  }
}
