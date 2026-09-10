use combat_engine::simulation::{BudgetTracker, ExecutionBudget, FrameClock};
use proptest::prelude::*;

proptest! {
    #[test]
    fn prop_frame_clock_monotonic(initial in 0u32..10_000, steps in 1usize..200) {
        let mut clock = FrameClock::new(initial);
        let mut prev = initial;
        for _ in 0..steps {
            let next = clock.advance();
            prop_assert!(next > prev);
            prop_assert_eq!(next, prev + 1);
            prev = next;
        }
    }

    #[test]
    fn prop_budget_tracker_frame_exhaustion(limit in 1u32..500) {
        let budget = ExecutionBudget {
            max_frames: limit,
            max_events: 100_000,
            max_state_transitions: 100_000,
            max_entities: 32,
            ..Default::default()
        };

        let mut tracker = BudgetTracker::new(budget, 2).unwrap();
        for _ in 0..limit {
            prop_assert!(tracker.check_frame_advance().is_ok());
        }
        // At limit, next advance must fail
        prop_assert!(tracker.check_frame_advance().is_err());
    }

    #[test]
    fn prop_budget_tracker_event_exhaustion(limit in 1usize..500) {
        let budget = ExecutionBudget {
            max_frames: 1000,
            max_events: limit,
            max_state_transitions: 100_000,
            max_entities: 32,
            ..Default::default()
        };

        let mut tracker = BudgetTracker::new(budget, 2).unwrap();
        for _ in 0..limit {
            prop_assert!(tracker.record_event().is_ok());
        }
        // At limit, next event must fail
        prop_assert!(tracker.record_event().is_err());
    }
}
