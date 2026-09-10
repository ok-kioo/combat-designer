use std::fs;
use std::path::Path;

#[test]
fn test_combat_domain_architecture_isolation() {
    let cargo_toml_path = Path::new("Cargo.toml");
    let content = fs::read_to_string(cargo_toml_path)
        .or_else(|_| fs::read_to_string("engine/Cargo.toml"))
        .expect("read Cargo.toml");

    let forbidden_deps = [
        "tokio", "chrono", "reqwest", "hyper", "postgres", "neo4j", "mcp", "fastify", "actix",
        "axum", "diesel", "sqlx",
    ];

    for dep in forbidden_deps {
        assert!(
            !content.to_lowercase().contains(&format!("{dep} =")),
            "VIOLATION: combat-domain imports forbidden dependency '{}'",
            dep
        );
    }
}
