use crate::error::DomainError;
use serde::{Deserialize, Serialize};

/// Separates untrusted engine-originated text from sanitized canonical names.
/// Defends against indirect prompt injection and parser corruption.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct SanitizedName {
    /// Normalized name containing only alphanumeric characters, spaces, underscores, and hyphens.
    pub name: String,
    /// Raw un-sanitized string preserved for display/provenance.
    pub raw_label: String,
    /// Explicit flag marking raw text as untrusted.
    pub untrusted_text: bool,
}

impl SanitizedName {
    /// Sanitizes an input string from an engine asset.
    /// Preserves the raw string in `raw_label` with `untrusted_text = true`.
    /// The sanitized `name` keeps only Unicode letters, numbers, spaces, underscores, and hyphens.
    pub fn from_raw(raw: impl Into<String>) -> Result<Self, DomainError> {
        let raw_str = raw.into();
        let trimmed = raw_str.trim();

        if trimmed.is_empty() {
            return Err(DomainError::SanitizationError(
                "Name cannot be empty".to_string(),
            ));
        }

        // Filter against restricted charset: Unicode alphabetic, numeric, space, underscore, hyphen
        let mut sanitized: String = trimmed
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '_' || *c == '-')
            .collect();

        // Collapse multiple spaces into single space and trim
        sanitized = sanitized.split_whitespace().collect::<Vec<_>>().join(" ");

        if sanitized.is_empty() {
            return Err(DomainError::SanitizationError(format!(
                "Name '{}' contains no valid characters after sanitization",
                raw_str
            )));
        }

        Ok(Self {
            name: sanitized,
            raw_label: raw_str,
            untrusted_text: true,
        })
    }

    pub fn as_str(&self) -> &str {
        &self.name
    }
}

impl std::fmt::Display for SanitizedName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.name)
    }
}
