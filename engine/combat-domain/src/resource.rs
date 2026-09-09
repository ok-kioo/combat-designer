use crate::error::DomainError;
use crate::frame::Frame;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceType {
    Stamina,
    Mana,
    Health,
    Meter,
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ResourceCost {
    pub resource_type: ResourceType,
    pub amount: u32,
    pub cost_frame: Frame,
}

impl ResourceCost {
    pub fn new(
        resource_type: ResourceType,
        amount: u32,
        cost_frame: impl Into<Frame>,
    ) -> Result<Self, DomainError> {
        Ok(Self {
            resource_type,
            amount,
            cost_frame: cost_frame.into(),
        })
    }
}
