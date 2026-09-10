//! ExecutionBudget protecting simulation against unbounded loops, DoS,
//! and excessive resource consumption.
//!
//! Architectural rule:
//! Budget exhaustion results in explicit BUDGET_EXCEEDED status.
//! It is NEVER treated as PASS or unexpected ERROR.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionBudget {
    pub max_frames: u32,
    pub max_events: usize,
    pub max_state_transitions: usize,
    pub max_entities: usize,
    #[serde(default)]
    pub max_iterations: Option<usize>,
    #[serde(default)]
    pub wall_clock_timeout_ms: Option<u64>,
}

impl ExecutionBudget {
    pub fn standard() -> Self {
        Self::default()
    }

    pub fn with_fuel(mut self, iterations: usize) -> Self {
        self.max_iterations = Some(iterations);
        self
    }
}

impl Default for ExecutionBudget {
    fn default() -> Self {
        Self {
            max_frames: 3600, // 60 seconds at 60fps
            max_events: 10_000,
            max_state_transitions: 5_000,
            max_entities: 32,
            max_iterations: None,
            wall_clock_timeout_ms: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BudgetExceededReason {
    MaxFramesExceeded { current: u32, limit: u32 },
    MaxEventsExceeded { current: usize, limit: usize },
    MaxTransitionsExceeded { current: usize, limit: usize },
    MaxEntitiesExceeded { current: usize, limit: usize },
    MaxIterationsExceeded { current: usize, limit: usize },
    TimeoutExceeded { timeout_ms: u64 },
}

impl std::fmt::Display for BudgetExceededReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MaxFramesExceeded { current, limit } => {
                write!(
                    f,
                    "Execution budget exceeded: reached frame {} (limit {})",
                    current, limit
                )
            }
            Self::MaxEventsExceeded { current, limit } => {
                write!(
                    f,
                    "Execution budget exceeded: emitted {} events (limit {})",
                    current, limit
                )
            }
            Self::MaxTransitionsExceeded { current, limit } => {
                write!(
                    f,
                    "Execution budget exceeded: executed {} state transitions (limit {})",
                    current, limit
                )
            }
            Self::MaxEntitiesExceeded { current, limit } => {
                write!(
                    f,
                    "Execution budget exceeded: registered {} entities (limit {})",
                    current, limit
                )
            }
            Self::MaxIterationsExceeded { current, limit } => {
                write!(
                    f,
                    "Execution budget exceeded: reached iteration {} (limit {})",
                    current, limit
                )
            }
            Self::TimeoutExceeded { timeout_ms } => {
                write!(
                    f,
                    "Execution budget exceeded: watchdog timeout {}ms expired",
                    timeout_ms
                )
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct BudgetTracker {
    budget: ExecutionBudget,
    pub frames: u32,
    pub events: usize,
    pub transitions: usize,
    pub entities: usize,
    pub iterations: usize,
}

impl BudgetTracker {
    pub fn new(budget: ExecutionBudget, entity_count: usize) -> Result<Self, BudgetExceededReason> {
        if entity_count > budget.max_entities {
            return Err(BudgetExceededReason::MaxEntitiesExceeded {
                current: entity_count,
                limit: budget.max_entities,
            });
        }
        Ok(Self {
            budget,
            frames: 0,
            events: 0,
            transitions: 0,
            entities: entity_count,
            iterations: 0,
        })
    }

    pub fn record_iteration(&mut self) -> Result<(), BudgetExceededReason> {
        self.iterations = self.iterations.saturating_add(1);
        if let Some(max_iter) = self.budget.max_iterations {
            if self.iterations > max_iter {
                return Err(BudgetExceededReason::MaxIterationsExceeded {
                    current: self.iterations,
                    limit: max_iter,
                });
            }
        }
        Ok(())
    }

    pub fn check_frame_advance(&mut self) -> Result<(), BudgetExceededReason> {
        if self.frames >= self.budget.max_frames {
            return Err(BudgetExceededReason::MaxFramesExceeded {
                current: self.frames,
                limit: self.budget.max_frames,
            });
        }
        self.frames = self.frames.saturating_add(1);
        Ok(())
    }

    pub fn record_event(&mut self) -> Result<(), BudgetExceededReason> {
        self.events = self.events.saturating_add(1);
        if self.events > self.budget.max_events {
            return Err(BudgetExceededReason::MaxEventsExceeded {
                current: self.events,
                limit: self.budget.max_events,
            });
        }
        Ok(())
    }

    pub fn record_transition(&mut self) -> Result<(), BudgetExceededReason> {
        self.transitions = self.transitions.saturating_add(1);
        if self.transitions > self.budget.max_state_transitions {
            return Err(BudgetExceededReason::MaxTransitionsExceeded {
                current: self.transitions,
                limit: self.budget.max_state_transitions,
            });
        }
        Ok(())
    }
}
