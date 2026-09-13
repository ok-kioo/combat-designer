# Agent Operations Layer

`.agents` contains operational orchestration, manifests, validators, and implementation evidence. It is not a runtime dependency.

## Mandatory startup

1. Read the execution contract.
2. Read mandatory routing.
3. Load the project manifest/bindings.
4. Follow the harness read order declared in the manifest.

Agent rules/skills here are reusable and binding-driven. Concrete project decisions belong in the project manifest/mapping and project specs, not inside reusable agent procedures.
