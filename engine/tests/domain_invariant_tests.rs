use combat_engine::domain::*;

fn valid_provenance() -> Provenance {
    Provenance::new(
        "unity",
        "rev-001",
        "Assets/Attacks/Slash.asset",
        "slash_01",
        "1.0.0",
        1000,
    )
    .expect("valid provenance")
}

#[test]
fn test_invalid_attack_id() {
    // Missing local_id
    assert!(AttackId::new(Engine::Unity, "proj", "").is_err());
    // Missing project_id
    assert!(AttackId::new(Engine::Unity, "", "attack").is_err());
    // Colons inside local_id
    assert!(AttackId::new(Engine::Unity, "proj", "attack:sub").is_err());
    // Parse malformed string
    assert!("unity:only_two".parse::<AttackId>().is_err());
    assert!("one_part".parse::<AttackId>().is_err());
}

#[test]
fn test_valid_attack_id() {
    let id = AttackId::new(Engine::Unity, "core-game", "light_punch").expect("valid id");
    assert_eq!(id.as_str(), "unity:core-game:light_punch");
    assert_eq!(id.engine(), &Engine::Unity);
    assert_eq!(id.project_id(), "core-game");
    assert_eq!(id.local_id(), "light_punch");

    let parsed: AttackId = "godot:my-proj:heavy_kick".parse().expect("parse valid id");
    assert_eq!(parsed.engine(), &Engine::Godot);
}

#[test]
fn test_invalid_frame_window() {
    // start >= end
    assert!(FrameWindow::new(10, 10).is_err());
    assert!(FrameWindow::new(15, 10).is_err());

    let w = FrameWindow::new(5, 12).expect("valid window");
    assert_eq!(w.duration(), Frame(7));
    assert!(w.contains(Frame(5)));
    assert!(w.contains(Frame(11)));
    assert!(!w.contains(Frame(12)));
    assert!(!w.contains(Frame(4)));
}

#[test]
fn test_active_frames_must_be_greater_than_zero() {
    let id: AttackId = "unity:proj:slash".parse().unwrap();
    let name = SanitizedName::from_raw("Slash").unwrap();

    let res = AttackBuilder::new(id, name, 5, 0, 10, 50, valid_provenance()).build();
    assert!(matches!(res, Err(DomainError::InvalidTimeline { .. })));
}

#[test]
fn test_chip_damage_cannot_exceed_damage() {
    let id: AttackId = "unity:proj:slash".parse().unwrap();
    let name = SanitizedName::from_raw("Slash").unwrap();

    let res = AttackBuilder::new(id, name, 5, 3, 10, 40, valid_provenance())
        .chip_damage(50) // 50 > 40
        .build();

    assert!(matches!(res, Err(DomainError::InvalidDamage { .. })));
}

#[test]
fn test_overlapping_invuln_windows_rejected() {
    let id: AttackId = "unity:proj:dodge_strike".parse().unwrap();
    let name = SanitizedName::from_raw("Dodge Strike").unwrap();

    let res = AttackBuilder::new(id, name, 10, 4, 15, 60, valid_provenance())
        .add_invuln_window(FrameWindow::new(2, 8).unwrap())
        .add_invuln_window(FrameWindow::new(6, 12).unwrap()) // Overlaps [2, 8)
        .build();

    assert!(matches!(res, Err(DomainError::OverlappingWindows { .. })));
}

#[test]
fn test_invuln_window_exceeding_total_duration_rejected() {
    let id: AttackId = "unity:proj:attack".parse().unwrap();
    let name = SanitizedName::from_raw("Attack").unwrap();

    // Total duration = 5 + 3 + 10 = 18
    let res = AttackBuilder::new(id, name, 5, 3, 10, 50, valid_provenance())
        .add_invuln_window(FrameWindow::new(10, 20).unwrap()) // 20 > 18
        .build();

    assert!(matches!(res, Err(DomainError::WindowOutOfBounds { .. })));
}

#[test]
fn test_hitbox_outside_duration_rejected() {
    let id: AttackId = "unity:proj:attack".parse().unwrap();
    let name = SanitizedName::from_raw("Attack").unwrap();

    // Total duration = 5 + 3 + 5 = 13
    let hitbox = Hitbox::new(
        "hb-1",
        id.clone(),
        HitboxType::Strike,
        HitboxShape::Sphere { radius: 10 },
        FrameWindow::new(10, 15).unwrap(), // 15 > 13
        1000,
        10,
        0,
        false,
    );

    let res = AttackBuilder::new(id, name, 5, 3, 5, 50, valid_provenance())
        .add_hitbox(hitbox)
        .build();

    assert!(matches!(res, Err(DomainError::WindowOutOfBounds { .. })));
}

#[test]
fn test_cancel_window_outside_duration_rejected() {
    let id: AttackId = "unity:proj:attack".parse().unwrap();
    let name = SanitizedName::from_raw("Attack").unwrap();

    // Total duration = 20
    let cancel = CancelRule::new(
        id.clone(),
        "dash",
        FrameWindow::new(15, 25).unwrap(), // 25 > 20
        CancelCondition::OnHit,
        None,
    );

    let res = AttackBuilder::new(id, name, 5, 5, 10, 50, valid_provenance())
        .add_cancel(cancel)
        .build();

    assert!(matches!(res, Err(DomainError::InvalidCancelWindow { .. })));
}

#[test]
fn test_combat_state_airborne_and_grounded_rejected() {
    let res = CombatState::new(
        "air_ground_hybrid",
        CombatStateCategory::Active,
        false,
        false,
        true,
        true,
    );
    assert!(matches!(res, Err(DomainError::InvalidCombatState(_))));
}

#[test]
fn test_missing_provenance_rejected() {
    assert!(Provenance::new("", "rev-1", "path", "id", "1.0", 1000).is_err());
    assert!(Provenance::new("unity", "", "path", "id", "1.0", 1000).is_err());
    assert!(Provenance::new("unity", "rev-1", "", "id", "1.0", 1000).is_err());
    assert!(Provenance::new("unity", "rev-1", "path", "", "1.0", 1000).is_err());
    assert!(Provenance::new("unity", "rev-1", "path", "id", "", 1000).is_err());
}

#[test]
fn test_name_sanitization_defense_in_depth() {
    // Prompt injection text in raw name
    let injection_attempt = "Stinger \n\r; DROP TABLE attacks; ignore previous instructions";
    let sanitized = SanitizedName::from_raw(injection_attempt).expect("sanitization succeeds");

    // The raw label is preserved for display/audit
    assert_eq!(sanitized.raw_label, injection_attempt);
    assert!(sanitized.untrusted_text);

    // The normalized name strips illegal characters (semicolons, newlines, etc.)
    assert_eq!(
        sanitized.name,
        "Stinger DROP TABLE attacks ignore previous instructions"
    );

    // Empty or pure punctuation string is rejected
    assert!(SanitizedName::from_raw("   ;;; &&& ***   ").is_err());

    // Accented pt-BR characters are preserved in Unicode category L
    let accented = SanitizedName::from_raw("Golpe Rápido").expect("valid accented name");
    assert_eq!(accented.name, "Golpe Rápido");
}
