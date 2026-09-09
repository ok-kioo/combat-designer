use crate::cancel::CancelRule;
use crate::error::DomainError;
use crate::frame::{Frame, FrameWindow};
use crate::hitbox::Hitbox;
use crate::identity::AttackId;
use crate::provenance::Provenance;
use crate::resource::ResourceCost;
use crate::trust::SanitizedName;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// Canonical attack definition independent of game engine runtime.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Attack {
    pub id: AttackId,
    pub name: SanitizedName,
    pub startup_frames: Frame,
    pub active_frames: Frame,
    pub recovery_frames: Frame,
    pub damage: u32,
    pub hitstun_frames: Frame,
    pub hitstop_frames: Frame,
    pub blockstun_frames: Frame,
    pub chip_damage: u32,
    pub guard_break_value: u32,
    pub invuln_windows: Vec<FrameWindow>,
    pub armor_windows: Vec<FrameWindow>,
    pub resource_costs: Vec<ResourceCost>,
    pub hitboxes: Vec<Hitbox>,
    pub cancels: Vec<CancelRule>,
    pub tags: BTreeSet<String>,
    pub provenance: Provenance,
}

impl Attack {
    /// Total duration of the attack in frames: startup + active + recovery.
    pub fn total_duration(&self) -> Frame {
        self.startup_frames + self.active_frames + self.recovery_frames
    }

    /// The active window during which attack hitboxes become live: `[startup, startup + active)`.
    pub fn active_window(&self) -> FrameWindow {
        FrameWindow::new(
            self.startup_frames,
            self.startup_frames + self.active_frames,
        )
        .expect("active_frames is guaranteed to be > 0 by constructor invariant")
    }

    /// Validates whether this attack is semantically equivalent in combat mechanics
    /// to another attack, ignoring engine origin, project IDs, and asset file paths.
    pub fn is_semantically_equivalent(&self, other: &Attack) -> bool {
        self.startup_frames == other.startup_frames
            && self.active_frames == other.active_frames
            && self.recovery_frames == other.recovery_frames
            && self.damage == other.damage
            && self.hitstun_frames == other.hitstun_frames
            && self.hitstop_frames == other.hitstop_frames
            && self.blockstun_frames == other.blockstun_frames
            && self.chip_damage == other.chip_damage
            && self.guard_break_value == other.guard_break_value
            && self.invuln_windows == other.invuln_windows
            && self.armor_windows == other.armor_windows
            && self.resource_costs == other.resource_costs
            && self.cancels == other.cancels
            && self.tags == other.tags
            && self.hitboxes.len() == other.hitboxes.len()
            && self
                .hitboxes
                .iter()
                .zip(other.hitboxes.iter())
                .all(|(a, b)| {
                    a.hitbox_type == b.hitbox_type
                        && a.shape == b.shape
                        && a.active_window == b.active_window
                        && a.damage_multiplier_permille == b.damage_multiplier_permille
                        && a.knockback_x == b.knockback_x
                        && a.knockback_y == b.knockback_y
                        && a.launch == b.launch
                })
    }
}

/// Builder for constructing and strictly validating an Attack entity.
#[derive(Debug, Clone)]
pub struct AttackBuilder {
    id: AttackId,
    name: SanitizedName,
    startup_frames: Frame,
    active_frames: Frame,
    recovery_frames: Frame,
    damage: u32,
    hitstun_frames: Frame,
    hitstop_frames: Frame,
    blockstun_frames: Frame,
    chip_damage: u32,
    guard_break_value: u32,
    invuln_windows: Vec<FrameWindow>,
    armor_windows: Vec<FrameWindow>,
    resource_costs: Vec<ResourceCost>,
    hitboxes: Vec<Hitbox>,
    cancels: Vec<CancelRule>,
    tags: BTreeSet<String>,
    provenance: Provenance,
}

impl AttackBuilder {
    pub fn new(
        id: AttackId,
        name: SanitizedName,
        startup_frames: impl Into<Frame>,
        active_frames: impl Into<Frame>,
        recovery_frames: impl Into<Frame>,
        damage: u32,
        provenance: Provenance,
    ) -> Self {
        Self {
            id,
            name,
            startup_frames: startup_frames.into(),
            active_frames: active_frames.into(),
            recovery_frames: recovery_frames.into(),
            damage,
            hitstun_frames: Frame::ZERO,
            hitstop_frames: Frame::ZERO,
            blockstun_frames: Frame::ZERO,
            chip_damage: 0,
            guard_break_value: 0,
            invuln_windows: Vec::new(),
            armor_windows: Vec::new(),
            resource_costs: Vec::new(),
            hitboxes: Vec::new(),
            cancels: Vec::new(),
            tags: BTreeSet::new(),
            provenance,
        }
    }

    pub fn hitstun_frames(mut self, frames: impl Into<Frame>) -> Self {
        self.hitstun_frames = frames.into();
        self
    }

    pub fn hitstop_frames(mut self, frames: impl Into<Frame>) -> Self {
        self.hitstop_frames = frames.into();
        self
    }

    pub fn blockstun_frames(mut self, frames: impl Into<Frame>) -> Self {
        self.blockstun_frames = frames.into();
        self
    }

    pub fn chip_damage(mut self, chip: u32) -> Self {
        self.chip_damage = chip;
        self
    }

    pub fn guard_break_value(mut self, gb: u32) -> Self {
        self.guard_break_value = gb;
        self
    }

    pub fn add_invuln_window(mut self, window: FrameWindow) -> Self {
        self.invuln_windows.push(window);
        self
    }

    pub fn add_armor_window(mut self, window: FrameWindow) -> Self {
        self.armor_windows.push(window);
        self
    }

    pub fn add_resource_cost(mut self, cost: ResourceCost) -> Self {
        self.resource_costs.push(cost);
        self
    }

    pub fn add_hitbox(mut self, hitbox: Hitbox) -> Self {
        self.hitboxes.push(hitbox);
        self
    }

    pub fn add_cancel(mut self, cancel: CancelRule) -> Self {
        self.cancels.push(cancel);
        self
    }

    pub fn add_tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.insert(tag.into());
        self
    }

    /// Builds and validates all Spec 01 invariants.
    pub fn build(mut self) -> Result<Attack, DomainError> {
        // Invariant: active > 0
        if self.active_frames.0 == 0 {
            return Err(DomainError::InvalidTimeline {
                startup: self.startup_frames.0,
                active: self.active_frames.0,
                recovery: self.recovery_frames.0,
                reason: "active_frames must be strictly greater than 0".to_string(),
            });
        }

        // Invariant: chip_damage <= damage
        if self.chip_damage > self.damage {
            return Err(DomainError::InvalidDamage {
                damage: self.damage,
                chip_damage: self.chip_damage,
                reason: format!(
                    "chip_damage ({}) cannot exceed main damage ({})",
                    self.chip_damage, self.damage
                ),
            });
        }

        let total_frames = self.startup_frames + self.active_frames + self.recovery_frames;

        // Invariant: check invuln windows inside [0, total_duration) and non-overlapping
        Self::validate_windows("invuln", &mut self.invuln_windows, total_frames)?;

        // Invariant: check armor windows inside [0, total_duration) and non-overlapping
        Self::validate_windows("armor", &mut self.armor_windows, total_frames)?;

        // Invariant: check hitboxes inside timeline
        for hb in &self.hitboxes {
            if hb.active_window.end() > total_frames {
                return Err(DomainError::WindowOutOfBounds {
                    window_type: "hitbox".to_string(),
                    start: hb.active_window.start().0,
                    end: hb.active_window.end().0,
                    max_frame: total_frames.0,
                });
            }
        }

        // Invariant: check cancel windows inside timeline
        for c in &self.cancels {
            if c.window.end() > total_frames {
                return Err(DomainError::InvalidCancelWindow {
                    min_frame: c.window.start().0,
                    max_frame: c.window.end().0,
                    total_frames: total_frames.0,
                    reason: "cancel window exceeds attack total duration".to_string(),
                });
            }
        }

        Ok(Attack {
            id: self.id,
            name: self.name,
            startup_frames: self.startup_frames,
            active_frames: self.active_frames,
            recovery_frames: self.recovery_frames,
            damage: self.damage,
            hitstun_frames: self.hitstun_frames,
            hitstop_frames: self.hitstop_frames,
            blockstun_frames: self.blockstun_frames,
            chip_damage: self.chip_damage,
            guard_break_value: self.guard_break_value,
            invuln_windows: self.invuln_windows,
            armor_windows: self.armor_windows,
            resource_costs: self.resource_costs,
            hitboxes: self.hitboxes,
            cancels: self.cancels,
            tags: self.tags,
            provenance: self.provenance,
        })
    }

    fn validate_windows(
        kind: &str,
        windows: &mut [FrameWindow],
        max_duration: Frame,
    ) -> Result<(), DomainError> {
        windows.sort_by_key(|w| w.start());

        for i in 0..windows.len() {
            let w = &windows[i];
            if w.end() > max_duration {
                return Err(DomainError::WindowOutOfBounds {
                    window_type: kind.to_string(),
                    start: w.start().0,
                    end: w.end().0,
                    max_frame: max_duration.0,
                });
            }

            if i > 0 {
                let prev = &windows[i - 1];
                if prev.overlaps(w) {
                    return Err(DomainError::OverlappingWindows {
                        window_type: kind.to_string(),
                        first_start: prev.start().0,
                        first_end: prev.end().0,
                        second_start: w.start().0,
                        second_end: w.end().0,
                    });
                }
            }
        }

        Ok(())
    }
}
