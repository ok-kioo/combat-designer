//! Verification rules module aggregating G01–G11 and counterplay safety rules.

pub mod cancel_validity;
pub mod counterplay;
pub mod determinism;
pub mod dps;
pub mod guard_integrity;
pub mod infinite_loop;
pub mod juggle;
pub mod provenance;
pub mod resource_safety;
pub mod stun_lock;
pub mod zero_risk;

pub use cancel_validity::check_cancel_validity;
pub use counterplay::check_counterplay;
pub use determinism::check_simulation_integrity;
pub use dps::check_dps_and_burst;
pub use guard_integrity::check_guard_integrity;
pub use infinite_loop::check_infinite_loop;
pub use juggle::check_juggle;
pub use provenance::check_provenance;
pub use resource_safety::check_resource_safety;
pub use stun_lock::check_stun_lock;
pub use zero_risk::check_zero_risk;
