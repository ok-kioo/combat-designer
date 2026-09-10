//! # combat-domain
//!
//! Pure, engine-agnostic canonical combat domain model.
//! Enforces frame invariants, resource constraints, identity provenance,
//! and trust boundaries at construction time.

pub mod archetype;
pub mod attack;
pub mod cancel;
pub mod error;
pub mod frame;
pub mod hitbox;
pub mod identity;
pub mod provenance;
pub mod resource;
pub mod state;
pub mod trust;

pub use archetype::Archetype;
pub use attack::{Attack, AttackBuilder};
pub use cancel::{CancelCondition, CancelRule};
pub use error::DomainError;
pub use frame::{Frame, FrameWindow};
pub use hitbox::{Hitbox, HitboxShape, HitboxType};
pub use identity::{AttackId, Engine};
pub use provenance::{Provenance, ProvenanceStatus};
pub use resource::{ResourceCost, ResourceType};
pub use state::{CombatState, CombatStateCategory};
pub use trust::SanitizedName;
