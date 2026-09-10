use combat_engine::domain::*;

#[test]
fn test_cross_engine_semantic_equivalence() {
    // 1. Attack representation extracted from Unity ScriptableObject
    let unity_id: AttackId = "unity:project-core:stinger_attack".parse().unwrap();
    let unity_name = SanitizedName::from_raw("Stinger").unwrap();
    let unity_prov = Provenance::new(
        "unity",
        "git-rev-abc",
        "Assets/Combat/Stinger.asset",
        "guid-12345",
        "unity-parser-v1",
        1000,
    )
    .unwrap();

    let unity_attack = AttackBuilder::new(unity_id, unity_name, 9, 3, 12, 100, unity_prov)
        .hitstun_frames(18)
        .hitstop_frames(4)
        .blockstun_frames(10)
        .chip_damage(15)
        .guard_break_value(20)
        .add_resource_cost(ResourceCost::new(ResourceType::Stamina, 25, 0).unwrap())
        .add_tag("thrust")
        .add_tag("ground")
        .build()
        .expect("valid unity attack");

    // 2. Attack representation extracted from Godot .tres resource
    let godot_id: AttackId = "godot:project-core:stinger_res".parse().unwrap();
    let godot_name = SanitizedName::from_raw("Stinger").unwrap();
    let godot_prov = Provenance::new(
        "godot",
        "git-rev-xyz",
        "res://combat/attacks/stinger.tres",
        "res-98765",
        "godot-parser-v1",
        1000,
    )
    .unwrap();

    let godot_attack = AttackBuilder::new(godot_id, godot_name, 9, 3, 12, 100, godot_prov)
        .hitstun_frames(18)
        .hitstop_frames(4)
        .blockstun_frames(10)
        .chip_damage(15)
        .guard_break_value(20)
        .add_resource_cost(ResourceCost::new(ResourceType::Stamina, 25, 0).unwrap())
        .add_tag("ground") // tags order in builder does not matter because BTreeSet is sorted
        .add_tag("thrust")
        .build()
        .expect("valid godot attack");

    // IDs and provenance are different:
    assert_ne!(unity_attack.id, godot_attack.id);
    assert_ne!(
        unity_attack.provenance.engine,
        godot_attack.provenance.engine
    );
    assert_ne!(
        unity_attack.provenance.source_path,
        godot_attack.provenance.source_path
    );

    // But they ARE semantically equivalent in mechanics:
    assert!(unity_attack.is_semantically_equivalent(&godot_attack));
    assert!(godot_attack.is_semantically_equivalent(&unity_attack));

    // 3. If Godot attack has 1 frame difference in recovery (e.g. 11 instead of 12),
    // they are NO LONGER semantically equivalent:
    let godot_id2: AttackId = "godot:project-core:stinger_res".parse().unwrap();
    let godot_name2 = SanitizedName::from_raw("Stinger").unwrap();
    let godot_prov2 = Provenance::new("godot", "rev-2", "res://path", "id", "v1", 1000).unwrap();
    let godot_different = AttackBuilder::new(godot_id2, godot_name2, 9, 3, 11, 100, godot_prov2)
        .hitstun_frames(18)
        .hitstop_frames(4)
        .blockstun_frames(10)
        .chip_damage(15)
        .guard_break_value(20)
        .add_resource_cost(ResourceCost::new(ResourceType::Stamina, 25, 0).unwrap())
        .add_tag("thrust")
        .add_tag("ground")
        .build()
        .unwrap();

    assert!(!unity_attack.is_semantically_equivalent(&godot_different));
}
