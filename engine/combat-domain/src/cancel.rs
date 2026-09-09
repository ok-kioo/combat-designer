use crate::frame::FrameWindow;
use crate::identity::AttackId;
use crate::resource::ResourceCost;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancelCondition {
    OnHit,
    OnBlock,
    OnWhiff,
    Always,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct CancelRule {
    pub source_attack: AttackId,
    pub target_action: String,
    pub window: FrameWindow,
    pub condition: CancelCondition,
    pub resource_cost: Option<ResourceCost>,
}

impl CancelRule {
    pub fn new(
        source_attack: AttackId,
        target_action: impl Into<String>,
        window: FrameWindow,
        condition: CancelCondition,
        resource_cost: Option<ResourceCost>,
    ) -> Self {
        Self {
            source_attack,
            target_action: target_action.into(),
            window,
            condition,
            resource_cost,
        }
    }
}
