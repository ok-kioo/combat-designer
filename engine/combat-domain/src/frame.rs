use crate::error::DomainError;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::ops::{Add, AddAssign, Sub, SubAssign};

/// Strongly typed integer frame count.
/// Prohibits any float or wall-clock usage for gameplay mechanics.
#[derive(
    Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default,
)]
pub struct Frame(pub u32);

impl Frame {
    pub const ZERO: Frame = Frame(0);

    pub fn new(val: u32) -> Self {
        Frame(val)
    }

    pub fn value(&self) -> u32 {
        self.0
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}f", self.0)
    }
}

impl Add for Frame {
    type Output = Frame;
    fn add(self, rhs: Frame) -> Frame {
        Frame(self.0.saturating_add(rhs.0))
    }
}

impl AddAssign for Frame {
    fn add_assign(&mut self, rhs: Frame) {
        self.0 = self.0.saturating_add(rhs.0);
    }
}

impl Sub for Frame {
    type Output = Frame;
    fn sub(self, rhs: Frame) -> Frame {
        Frame(self.0.saturating_sub(rhs.0))
    }
}

impl SubAssign for Frame {
    fn sub_assign(&mut self, rhs: Frame) {
        self.0 = self.0.saturating_sub(rhs.0);
    }
}

impl From<u32> for Frame {
    fn from(val: u32) -> Self {
        Frame(val)
    }
}

impl From<Frame> for u32 {
    fn from(frame: Frame) -> Self {
        frame.0
    }
}

/// Represents a contiguous half-open range of frames: `[start, end)`.
/// Invariant: `start < end` (a window must have duration > 0).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct FrameWindow {
    start: Frame,
    end: Frame,
}

impl FrameWindow {
    /// Creates a new FrameWindow with invariant validation: `start < end`.
    pub fn new(start: impl Into<Frame>, end: impl Into<Frame>) -> Result<Self, DomainError> {
        let s = start.into();
        let e = end.into();
        if s.0 >= e.0 {
            return Err(DomainError::InvalidFrameWindow {
                start: s.0,
                end: e.0,
                reason: format!(
                    "start frame ({}) must be strictly less than end frame ({})",
                    s.0, e.0
                ),
            });
        }
        Ok(Self { start: s, end: e })
    }

    pub fn start(&self) -> Frame {
        self.start
    }

    pub fn end(&self) -> Frame {
        self.end
    }

    pub fn duration(&self) -> Frame {
        self.end - self.start
    }

    /// Checks if a frame falls within this half-open window `[start, end)`.
    pub fn contains(&self, frame: Frame) -> bool {
        frame >= self.start && frame < self.end
    }

    /// Checks if this window overlaps with another window.
    /// Two half-open intervals `[a, b)` and `[c, d)` overlap iff `max(a, c) < min(b, d)`.
    pub fn overlaps(&self, other: &FrameWindow) -> bool {
        let max_start = std::cmp::max(self.start.0, other.start.0);
        let min_end = std::cmp::min(self.end.0, other.end.0);
        max_start < min_end
    }
}

impl fmt::Display for FrameWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}, {})", self.start, self.end)
    }
}
