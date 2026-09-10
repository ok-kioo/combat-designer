//! Deterministic replay runner.
//!
//! Reconstructs exact event log, snapshots, metrics, and StateHash from inputs.

use crate::simulation::engine::{CombatSimulator, SimulationInput, SimulationOutput};

pub struct ReplayRunner;

impl ReplayRunner {
    pub fn replay(input: SimulationInput) -> SimulationOutput {
        CombatSimulator::simulate(input)
    }

    pub fn verify_replay(
        input_generator: impl Fn() -> SimulationInput,
        expected_hash: &str,
    ) -> bool {
        let output = Self::replay(input_generator());
        output.final_state_hash == expected_hash
    }
}
