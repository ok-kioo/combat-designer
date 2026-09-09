//! # combat-simulation
//!
//! Pure, deterministic discrete frame-clock combat simulation engine.
//!
//! Enforces:
//! - Strict integer FrameClock (u32), zero floats, zero wall clock
//! - Contractual 10-step frame execution loop
//! - Deterministic tie-breaking by (frame, actor_id, attack_id, sequence)
//! - ExecutionBudget boundaries producing explicit BUDGET_EXCEEDED
//! - Canonical StateHash via SHA-256
//! - Replay fidelity

pub mod budget;
pub mod clock;
pub mod engine;
pub mod events;
pub mod metrics;
pub mod model;
pub mod order;
pub mod replay;
pub mod sha256;
pub mod snapshot;

pub use budget::{BudgetExceededReason, BudgetTracker, ExecutionBudget};
pub use clock::FrameClock;
pub use engine::{CombatSimulator, SimulationInput, SimulationOutput, SimulationStatus};
pub use events::{SimulationEvent, SimulationEventType};
pub use metrics::SimulationMetrics;
pub use model::{ActiveAttackState, ActorCommand, ActorState};
pub use replay::ReplayRunner;
pub use snapshot::{ActorSnapshot, SimulationSnapshot};
