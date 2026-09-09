use crate::frame::Frame;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Archetype {
    pub id: String,
    pub reaction_window_min: Frame,
    pub max_juggle_frames: Frame,
    pub max_sustained_dps: u32,
    pub escape_rules: Vec<String>,
}

impl Archetype {
    pub fn new(
        id: impl Into<String>,
        reaction_window_min: impl Into<Frame>,
        max_juggle_frames: impl Into<Frame>,
        max_sustained_dps: u32,
        escape_rules: Vec<String>,
    ) -> Self {
        Self {
            id: id.into(),
            reaction_window_min: reaction_window_min.into(),
            max_juggle_frames: max_juggle_frames.into(),
            max_sustained_dps,
            escape_rules,
        }
    }
}
