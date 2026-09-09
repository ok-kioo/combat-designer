use std::fs;
use std::path::{Path, PathBuf};

fn get_simulation_src_dir() -> PathBuf {
    let direct = Path::new("src");
    if direct.exists() {
        direct.to_path_buf()
    } else {
        Path::new("engine/combat-simulation/src").to_path_buf()
    }
}

fn get_simulation_cargo_toml() -> PathBuf {
    let direct = Path::new("Cargo.toml");
    if direct.exists()
        && fs::read_to_string(direct)
            .map(|s| s.contains("combat-simulation"))
            .unwrap_or(false)
    {
        direct.to_path_buf()
    } else {
        Path::new("engine/combat-simulation/Cargo.toml").to_path_buf()
    }
}

// 04.T.18: No system clock, wall-clock, sleep or non-seeded random used
#[test]
fn test_04_t_18_no_system_clock_or_wall_time_used() {
    let src_dir = get_simulation_src_dir();
    let forbidden_patterns = [
        "Instant::now",
        "SystemTime::now",
        "std::time::Instant",
        "std::time::SystemTime",
        "thread::sleep",
        "std::thread::sleep",
        "chrono::",
    ];

    for entry in fs::read_dir(&src_dir).expect("read src dir") {
        let entry = entry.expect("valid entry");
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            let content = fs::read_to_string(&path).expect("read file");
            for pattern in &forbidden_patterns {
                assert!(
                    !content.contains(pattern),
                    "VIOLATION in {:?}: found forbidden time/clock pattern '{}'",
                    path,
                    pattern
                );
            }
        }
    }
}

// 04.T.19: Zero floating-point math in core gameplay mechanics
#[test]
fn test_04_t_19_no_floating_point_gameplay_math() {
    let src_dir = get_simulation_src_dir();
    let gameplay_files = ["clock.rs", "order.rs", "budget.rs", "events.rs", "model.rs"];

    for file_name in &gameplay_files {
        let path = src_dir.join(file_name);
        if path.exists() {
            let content = fs::read_to_string(&path).expect("read file");
            assert!(
                !content.contains("f32") && !content.contains("f64"),
                "VIOLATION in {:?}: gameplay mechanics must use integer arithmetic only, found float type",
                path
            );
        }
    }
}

// 04.T.20: Domain and simulation architecture isolation
#[test]
fn test_04_t_20_architecture_isolation() {
    let cargo_toml = get_simulation_cargo_toml();
    let content = fs::read_to_string(&cargo_toml).expect("read Cargo.toml");

    let forbidden_dependencies = [
        "tokio",
        "chrono",
        "reqwest",
        "hyper",
        "postgres",
        "neo4j",
        "neo4rs",
        "mcp",
        "fastify",
        "actix",
        "axum",
        "diesel",
        "sqlx",
        "combat-gate",
    ];

    for dep in &forbidden_dependencies {
        assert!(
            !content.to_lowercase().contains(&format!("{} =", dep)),
            "VIOLATION: combat-simulation must be pure rust engine; forbidden dependency '{}' found in {:?}",
            dep,
            cargo_toml
        );
    }
}
