use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    #[error("Invalid AttackId '{0}': format must be '{{engine}}:{{project_id}}:{{local_id}}'")]
    InvalidAttackId(String),

    #[error("Invalid FrameWindow [{start}, {end}): {reason}")]
    InvalidFrameWindow {
        start: u32,
        end: u32,
        reason: String,
    },

    #[error(
        "Invalid timeline (startup={startup}, active={active}, recovery={recovery}): {reason}"
    )]
    InvalidTimeline {
        startup: u32,
        active: u32,
        recovery: u32,
        reason: String,
    },

    #[error("Invalid damage: damage={damage}, chip_damage={chip_damage}. Reason: {reason}")]
    InvalidDamage {
        damage: u32,
        chip_damage: u32,
        reason: String,
    },

    #[error("Invalid resource cost for {resource}: {reason}")]
    InvalidResourceCost {
        resource: String,
        amount: u32,
        reason: String,
    },

    #[error("Invalid cancel window [{min_frame}, {max_frame}) for total duration {total_frames}: {reason}")]
    InvalidCancelWindow {
        min_frame: u32,
        max_frame: u32,
        total_frames: u32,
        reason: String,
    },

    #[error("Overlapping {window_type} windows: [{first_start}, {first_end}) and [{second_start}, {second_end})")]
    OverlappingWindows {
        window_type: String,
        first_start: u32,
        first_end: u32,
        second_start: u32,
        second_end: u32,
    },

    #[error("{window_type} window [{start}, {end}) exceeds attack total duration {max_frame}")]
    WindowOutOfBounds {
        window_type: String,
        start: u32,
        end: u32,
        max_frame: u32,
    },

    #[error("Invalid combat state: {0}")]
    InvalidCombatState(String),

    #[error("Missing required provenance field: {0}")]
    MissingProvenance(String),

    #[error("Quarantined asset '{asset_id}': {reason}")]
    QuarantinedAsset { asset_id: String, reason: String },

    #[error("Sanitization error: {0}")]
    SanitizationError(String),
}
