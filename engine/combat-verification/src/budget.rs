//! Verification budget definition and deterministic bounded execution tracking.
//!
//! Protects against state space explosion, infinite cycle search, and pathological
//! simulation event sequences. Never uses wall-clock time.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerificationBudget {
    pub max_events_to_analyze: u32,
    pub max_states_explored: u32,
    pub max_cycles_checked: u32,
    pub max_verification_steps: u32,
    pub max_evidence_items: u32,
}

impl Default for VerificationBudget {
    fn default() -> Self {
        Self {
            max_events_to_analyze: 10_000,
            max_states_explored: 10_000,
            max_cycles_checked: 5_000,
            max_verification_steps: 50_000,
            max_evidence_items: 500,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum BudgetExceededReason {
    #[error("Maximum events to analyze exceeded: {current} >= {limit}")]
    EventsExceeded { current: u32, limit: u32 },

    #[error("Maximum states explored exceeded: {current} >= {limit}")]
    StatesExceeded { current: u32, limit: u32 },

    #[error("Maximum cycles checked exceeded: {current} >= {limit}")]
    CyclesExceeded { current: u32, limit: u32 },

    #[error("Maximum verification steps exceeded: {current} >= {limit}")]
    StepsExceeded { current: u32, limit: u32 },

    #[error("Maximum evidence items exceeded: {current} >= {limit}")]
    EvidenceExceeded { current: u32, limit: u32 },

    #[error("Arithmetic overflow in budget counter")]
    Overflow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerificationBudgetResult {
    pub exhausted: bool,
    pub reason: Option<String>,
    pub events_analyzed: u32,
    pub states_explored: u32,
    pub cycles_checked: u32,
    pub steps_taken: u32,
    pub evidence_count: u32,
}

#[derive(Debug)]
pub struct VerificationBudgetTracker {
    budget: VerificationBudget,
    events_analyzed: u32,
    states_explored: u32,
    cycles_checked: u32,
    steps_taken: u32,
    evidence_count: u32,
    exhausted_reason: Option<BudgetExceededReason>,
}

impl VerificationBudgetTracker {
    pub fn new(budget: VerificationBudget) -> Self {
        Self {
            budget,
            events_analyzed: 0,
            states_explored: 0,
            cycles_checked: 0,
            steps_taken: 0,
            evidence_count: 0,
            exhausted_reason: None,
        }
    }

    pub fn track_step(&mut self) -> Result<(), BudgetExceededReason> {
        if let Some(ref reason) = self.exhausted_reason {
            return Err(reason.clone());
        }
        self.steps_taken = self
            .steps_taken
            .checked_add(1)
            .ok_or(BudgetExceededReason::Overflow)?;
        if self.steps_taken > self.budget.max_verification_steps {
            let err = BudgetExceededReason::StepsExceeded {
                current: self.steps_taken,
                limit: self.budget.max_verification_steps,
            };
            self.exhausted_reason = Some(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub fn track_events(&mut self, count: u32) -> Result<(), BudgetExceededReason> {
        if let Some(ref reason) = self.exhausted_reason {
            return Err(reason.clone());
        }
        self.events_analyzed = self
            .events_analyzed
            .checked_add(count)
            .ok_or(BudgetExceededReason::Overflow)?;
        if self.events_analyzed > self.budget.max_events_to_analyze {
            let err = BudgetExceededReason::EventsExceeded {
                current: self.events_analyzed,
                limit: self.budget.max_events_to_analyze,
            };
            self.exhausted_reason = Some(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub fn track_state(&mut self) -> Result<(), BudgetExceededReason> {
        if let Some(ref reason) = self.exhausted_reason {
            return Err(reason.clone());
        }
        self.states_explored = self
            .states_explored
            .checked_add(1)
            .ok_or(BudgetExceededReason::Overflow)?;
        if self.states_explored > self.budget.max_states_explored {
            let err = BudgetExceededReason::StatesExceeded {
                current: self.states_explored,
                limit: self.budget.max_states_explored,
            };
            self.exhausted_reason = Some(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub fn track_cycle(&mut self) -> Result<(), BudgetExceededReason> {
        if let Some(ref reason) = self.exhausted_reason {
            return Err(reason.clone());
        }
        self.cycles_checked = self
            .cycles_checked
            .checked_add(1)
            .ok_or(BudgetExceededReason::Overflow)?;
        if self.cycles_checked > self.budget.max_cycles_checked {
            let err = BudgetExceededReason::CyclesExceeded {
                current: self.cycles_checked,
                limit: self.budget.max_cycles_checked,
            };
            self.exhausted_reason = Some(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub fn track_evidence(&mut self) -> Result<(), BudgetExceededReason> {
        if let Some(ref reason) = self.exhausted_reason {
            return Err(reason.clone());
        }
        self.evidence_count = self
            .evidence_count
            .checked_add(1)
            .ok_or(BudgetExceededReason::Overflow)?;
        if self.evidence_count > self.budget.max_evidence_items {
            let err = BudgetExceededReason::EvidenceExceeded {
                current: self.evidence_count,
                limit: self.budget.max_evidence_items,
            };
            self.exhausted_reason = Some(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub fn to_result(&self) -> VerificationBudgetResult {
        VerificationBudgetResult {
            exhausted: self.exhausted_reason.is_some(),
            reason: self.exhausted_reason.as_ref().map(|r| r.to_string()),
            events_analyzed: self.events_analyzed,
            states_explored: self.states_explored,
            cycles_checked: self.cycles_checked,
            steps_taken: self.steps_taken,
            evidence_count: self.evidence_count,
        }
    }
}
