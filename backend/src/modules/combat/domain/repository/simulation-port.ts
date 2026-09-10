import type { SimulationInput, SimulationOutput } from "@combat-designer/backend";

/**
 * Port representing the simulation capability boundary.
 *
 * Decouples the Application layer and use cases from the concrete
 * Rust Engine execution method (direct native bindings, child process, WASM, etc.).
 */
export interface SimulationPort {
  simulate(input: SimulationInput): Promise<SimulationOutput>;
}
