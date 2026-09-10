use crate::domain::error::DomainError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CombatStateCategory {
    Neutral,
    Startup,
    Active,
    Recovery,
    Hitstun,
    Blockstun,
    Knockdown,
    Juggle,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CombatState {
    pub id: String,
    pub category: CombatStateCategory,
    pub interruptible: bool,
    pub invulnerable: bool,
    pub airborne: bool,
    pub grounded: bool,
}

impl CombatState {
    pub fn new(
        id: impl Into<String>,
        category: CombatStateCategory,
        interruptible: bool,
        invulnerable: bool,
        airborne: bool,
        grounded: bool,
    ) -> Result<Self, DomainError> {
        let state_id = id.into();
        if airborne && grounded {
            return Err(DomainError::InvalidCombatState(format!(
                "State '{}' cannot be both airborne and grounded simultaneously",
                state_id
            )));
        }
        Ok(Self {
            id: state_id,
            category,
            interruptible,
            invulnerable,
            airborne,
            grounded,
        })
    }
}
