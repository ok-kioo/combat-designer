//! Discrete integer FrameClock for deterministic combat simulation.
//!
//! Enforces:
//! - Strict integer frame progression (u32)
//! - Zero floating-point time calculations
//! - Zero wall-clock / system-time dependencies
//! - Monotonic advancement: frame[n+1] > frame[n]

use combat_domain::Frame;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct FrameClock {
    current: u32,
}

impl FrameClock {
    pub fn new(start_frame: u32) -> Self {
        Self {
            current: start_frame,
        }
    }

    pub fn current_frame(&self) -> u32 {
        self.current
    }

    pub fn as_frame(&self) -> Frame {
        Frame::new(self.current)
    }

    /// Advances the clock by exactly 1 frame.
    /// Returns the new frame value.
    pub fn advance(&mut self) -> u32 {
        self.current = self.current.saturating_add(1);
        self.current
    }

    /// Alias for advance.
    pub fn tick(&mut self) -> u32 {
        self.advance()
    }

    /// Resets the clock to a specified frame.
    pub fn reset(&mut self, frame: u32) {
        self.current = frame;
    }
}

impl Default for FrameClock {
    fn default() -> Self {
        Self::new(0)
    }
}
