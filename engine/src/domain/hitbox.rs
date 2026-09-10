use crate::domain::frame::FrameWindow;
use crate::domain::identity::AttackId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HitboxType {
    Strike,
    Throw,
    Projectile,
    Counter,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(tag = "shape_type", rename_all = "snake_case")]
pub enum HitboxShape {
    Box { width: u32, height: u32 },
    Sphere { radius: u32 },
    Capsule { radius: u32, height: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Hitbox {
    pub id: String,
    pub attack_id: AttackId,
    pub hitbox_type: HitboxType,
    pub shape: HitboxShape,
    pub active_window: FrameWindow,
    pub damage_multiplier_permille: u32, // 1000 = 1.0x
    pub knockback_x: i32,
    pub knockback_y: i32,
    pub launch: bool,
}

impl Hitbox {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: impl Into<String>,
        attack_id: AttackId,
        hitbox_type: HitboxType,
        shape: HitboxShape,
        active_window: FrameWindow,
        damage_multiplier_permille: u32,
        knockback_x: i32,
        knockback_y: i32,
        launch: bool,
    ) -> Self {
        Self {
            id: id.into(),
            attack_id,
            hitbox_type,
            shape,
            active_window,
            damage_multiplier_permille,
            knockback_x,
            knockback_y,
            launch,
        }
    }
}
