import type {
  SimulationOutput,
} from "../entity/simulation.types.js";
import type {
  VerificationRequest,
} from "../entity/verification.types.js";
import type { Finding, Recommendation } from "../entity/analysis.js";

/**
 * Result produced by Combat Analysis / Diagnostics.
 * Pure fact and diagnostic findings; NEVER an authorization verdict or mutation.
 */
export interface CombatAnalysisResult {
  analysis_id: string;
  workspace_id: string;
  project_revision: string;
  status: "COMPLETED" | "INCONCLUSIVE" | "BUDGET_EXCEEDED" | "STALE" | "ERROR";
  findings: Finding[];
  recommendations: Recommendation[];
  evidence_count: number;
  analyzed_at: string;
}

/**
 * Port representing the Combat Analysis and Diagnostics capability boundary.
 *
 * Decouples the Application layer and orchestration use cases from the concrete
 * diagnostic/analysis engine.
 *
 * CombatAnalysisPort evaluates SimulationOutput and model evidence to produce
 * consultative findings and recommendations for human designers.
 */
export interface CombatAnalysisPort {
  analyze(
    request: VerificationRequest,
    simulation: SimulationOutput
  ): Promise<CombatAnalysisResult>;
}
