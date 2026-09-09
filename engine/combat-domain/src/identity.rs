use crate::error::DomainError;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::str::FromStr;

/// Source engine classification for assets.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Unity,
    Unreal,
    Godot,
    Custom(String),
}

impl fmt::Display for Engine {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Engine::Unity => write!(f, "unity"),
            Engine::Unreal => write!(f, "unreal"),
            Engine::Godot => write!(f, "godot"),
            Engine::Custom(name) => write!(f, "{}", name),
        }
    }
}

impl FromStr for Engine {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "unity" => Ok(Engine::Unity),
            "unreal" => Ok(Engine::Unreal),
            "godot" => Ok(Engine::Godot),
            other => Ok(Engine::Custom(other.to_string())),
        }
    }
}

/// Qualified identifier for an attack: `{engine}:{project_id}:{local_id}`.
/// Prevents cross-engine asset collision when similar names are used.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AttackId {
    engine: Engine,
    project_id: String,
    local_id: String,
    raw: String,
}

impl AttackId {
    /// Constructs and validates a qualified AttackId.
    pub fn new(
        engine: impl Into<Engine>,
        project_id: impl Into<String>,
        local_id: impl Into<String>,
    ) -> Result<Self, DomainError> {
        let eng = engine.into();
        let proj = project_id.into().trim().to_string();
        let local = local_id.into().trim().to_string();

        if proj.is_empty() {
            return Err(DomainError::InvalidAttackId(
                "project_id must not be empty".to_string(),
            ));
        }
        if local.is_empty() {
            return Err(DomainError::InvalidAttackId(
                "local_id must not be empty".to_string(),
            ));
        }
        if proj.contains(':') || local.contains(':') {
            return Err(DomainError::InvalidAttackId(
                "project_id and local_id must not contain ':' colons".to_string(),
            ));
        }

        let raw = format!("{}:{}:{}", eng, proj, local);
        Ok(Self {
            engine: eng,
            project_id: proj,
            local_id: local,
            raw,
        })
    }

    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    pub fn project_id(&self) -> &str {
        &self.project_id
    }

    pub fn local_id(&self) -> &str {
        &self.local_id
    }

    pub fn as_str(&self) -> &str {
        &self.raw
    }
}

impl fmt::Display for AttackId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.raw)
    }
}

impl FromStr for AttackId {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() != 3 {
            return Err(DomainError::InvalidAttackId(format!(
                "expected '{{engine}}:{{project_id}}:{{local_id}}', got '{}'",
                s
            )));
        }
        let engine = Engine::from_str(parts[0]).unwrap();
        AttackId::new(engine, parts[1], parts[2])
    }
}

impl Serialize for AttackId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.raw)
    }
}

impl<'de> Deserialize<'de> for AttackId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        AttackId::from_str(&s).map_err(serde::de::Error::custom)
    }
}
