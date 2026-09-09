use combat_domain::*;

#[test]
fn test_deterministic_serialization_100_runs() {
    let id: AttackId = "unreal:blade-master:slash_heavy".parse().unwrap();
    let name = SanitizedName::from_raw("Heavy Slash").unwrap();
    let prov = Provenance::new(
        "unreal",
        "rev-42",
        "/Game/Combat/HeavySlash.uasset",
        "asset-42",
        "unreal-v1",
        950,
    )
    .unwrap();

    let attack = AttackBuilder::new(id, name, 14, 4, 22, 180, prov)
        .hitstun_frames(28)
        .hitstop_frames(6)
        .blockstun_frames(14)
        .chip_damage(30)
        .guard_break_value(50)
        .add_resource_cost(ResourceCost::new(ResourceType::Stamina, 40, 0).unwrap())
        .add_tag("heavy")
        .add_tag("slash")
        .add_tag("ground")
        .build()
        .expect("valid attack");

    let reference_json = serde_json::to_string(&attack).expect("serialize");

    // Serialize 100 times, ensure 100% byte-for-byte identical output
    for _ in 0..100 {
        let serialized = serde_json::to_string(&attack).expect("serialize");
        assert_eq!(serialized, reference_json);
    }

    // Roundtrip test: deserialize then serialize
    let deserialized: Attack = serde_json::from_str(&reference_json).expect("deserialize");
    let roundtrip_json = serde_json::to_string(&deserialized).expect("re-serialize");
    assert_eq!(roundtrip_json, reference_json);
    assert_eq!(deserialized, attack);
}
