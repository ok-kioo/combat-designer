import type {
  VerificationRequest,
  GateResult,
  SimulationOutput,
} from "@combat-designer/backend";

/**
 * Port representing the Mechanical Gate capability boundary.
 *
 * Decouples the Application layer and orchestration use cases from the concrete
 * Rust verification engine (e.g. direct native binding, child process, WASM, etc.).
 *
 * MechanicalGatePort answers "IS IT SAFE / VALID?" based on facts produced by
 * the Simulator and structural evidence from the model.
 */
export interface MechanicalGatePort {
  verify(
    request: VerificationRequest,
    simulation: SimulationOutput
  ): Promise<GateResult>;
}
