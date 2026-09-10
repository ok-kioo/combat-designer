use crate::domain::error::DomainError;
use serde::{Deserialize, Serialize};

/// Provenance status indicating whether data is canonical, derived, or quarantined.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProvenanceStatus {
    Canonical,
    Derived,
    Quarantined { reason: String },
}

/// Metadata proving the exact origin and extraction context of a combat asset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Provenance {
    pub engine: String,
    pub project_revision: String,
    pub source_path: String,
    pub asset_id: String,
    pub parser_version: String,
    pub confidence_permille: u32, // 1000 = 100% confidence, integer representation
    pub status: ProvenanceStatus,
}

impl Provenance {
    pub fn new(
        engine: impl Into<String>,
        project_revision: impl Into<String>,
        source_path: impl Into<String>,
        asset_id: impl Into<String>,
        parser_version: impl Into<String>,
        confidence_permille: u32,
    ) -> Result<Self, DomainError> {
        let eng = engine.into().trim().to_string();
        let rev = project_revision.into().trim().to_string();
        let path = source_path.into().trim().to_string();
        let id = asset_id.into().trim().to_string();
        let pver = parser_version.into().trim().to_string();

        if eng.is_empty() {
            return Err(DomainError::MissingProvenance("engine".into()));
        }
        if rev.is_empty() {
            return Err(DomainError::MissingProvenance("project_revision".into()));
        }
        if path.is_empty() {
            return Err(DomainError::MissingProvenance("source_path".into()));
        }
        if id.is_empty() {
            return Err(DomainError::MissingProvenance("asset_id".into()));
        }
        if pver.is_empty() {
            return Err(DomainError::MissingProvenance("parser_version".into()));
        }

        let clamped_conf = std::cmp::min(confidence_permille, 1000);

        Ok(Self {
            engine: eng,
            project_revision: rev,
            source_path: path,
            asset_id: id,
            parser_version: pver,
            confidence_permille: clamped_conf,
            status: ProvenanceStatus::Canonical,
        })
    }

    /// Creates a quarantined provenance record when an asset cannot be safely parsed.
    pub fn quarantined(
        engine: impl Into<String>,
        source_path: impl Into<String>,
        asset_id: impl Into<String>,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            engine: engine.into(),
            project_revision: "unknown".into(),
            source_path: source_path.into(),
            asset_id: asset_id.into(),
            parser_version: "unknown".into(),
            confidence_permille: 0,
            status: ProvenanceStatus::Quarantined {
                reason: reason.into(),
            },
        }
    }

    pub fn is_quarantined(&self) -> bool {
        matches!(self.status, ProvenanceStatus::Quarantined { .. })
    }
}
