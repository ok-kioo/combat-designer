use combat_domain::*;
use proptest::prelude::*;

proptest! {
    #[test]
    fn prop_frame_addition_commutative(a in 0u32..10_000, b in 0u32..10_000) {
        let fa = Frame(a);
        let fb = Frame(b);
        prop_assert_eq!(fa + fb, fb + fa);
    }

    #[test]
    fn prop_frame_addition_associative(a in 0u32..5_000, b in 0u32..5_000, c in 0u32..5_000) {
        let fa = Frame(a);
        let fb = Frame(b);
        let fc = Frame(c);
        prop_assert_eq!((fa + fb) + fc, fa + (fb + fc));
    }

    #[test]
    fn prop_frame_window_overlap_symmetry(
        s1 in 0u32..500, d1 in 1u32..100,
        s2 in 0u32..500, d2 in 1u32..100,
    ) {
        let w1 = FrameWindow::new(s1, s1 + d1).unwrap();
        let w2 = FrameWindow::new(s2, s2 + d2).unwrap();
        prop_assert_eq!(w1.overlaps(&w2), w2.overlaps(&w1));
    }

    #[test]
    fn prop_attack_id_roundtrip(
        engine in "(unity|unreal|godot)",
        proj in "[a-z0-9_-]{1,20}",
        local in "[a-z0-9_.-]{1,30}",
    ) {
        let id_str = format!("{}:{}:{}", engine, proj, local);
        let parsed: Result<AttackId, _> = id_str.parse();
        prop_assert!(parsed.is_ok());
        let id = parsed.unwrap();
        prop_assert_eq!(id.to_string(), id_str);
    }
}
