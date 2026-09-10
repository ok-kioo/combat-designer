use std::fs;
use std::path::Path;

#[test]
fn test_engine_cargo_toml_has_no_forbidden_dependencies() {
    let cargo_toml_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let content = fs::read_to_string(&cargo_toml_path)
        .expect("Cargo.toml must exist")
        .to_lowercase();

    let forbidden = [
        "tokio", "actix", "reqwest", "hyper", "fastify", "postgres", "neo4j", "redis", "sqlx",
        "diesel", "rand",
    ];

    for dep in forbidden {
        assert!(
            !content.contains(&format!("{dep} =")),
            "combat-verification must not depend on forbidden dependency '{dep}'"
        );
    }
}

fn get_rs_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(get_rs_files(&path));
            } else if path.extension().map_or(false, |ext| ext == "rs") {
                files.push(path);
            }
        }
    }
    files
}

#[test]
fn test_verification_source_code_has_no_wall_clock_time() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let forbidden_patterns = [
        "std::time::Instant",
        "std::time::SystemTime",
        "SystemTime::now",
        "Instant::now",
    ];

    for file in get_rs_files(&src_dir) {
        let content = fs::read_to_string(&file).expect("Source file must be readable");
        for pattern in forbidden_patterns {
            assert!(
                !content.contains(pattern),
                "Forbidden wall-clock pattern '{}' found in {:?}",
                pattern,
                file
            );
        }
    }
}

#[test]
fn test_verification_source_code_has_no_floats_in_mechanics() {
    let src_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let forbidden_types = ["f32", "f64"];

    for file in get_rs_files(&src_dir) {
        let content = fs::read_to_string(&file).expect("Source file must be readable");
        for ftype in forbidden_types {
            assert!(
                !content.contains(&format!(": {ftype}"))
                    && !content.contains(&format!("-> {ftype}"))
                    && !content.contains(&format!("as {ftype}")),
                "Forbidden floating-point type '{}' found in {:?}",
                ftype,
                file
            );
        }
    }
}
