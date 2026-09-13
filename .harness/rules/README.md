# Reusable Rules Contract

## Purpose

Rules in this directory are **project-agnostic invariants**. They must remain reusable across repositories and must not encode repository-specific paths, package names, specification numbers, entity names, vendor choices, framework choices, or historical incidents.

Project-specific facts belong in project specifications or in a project binding/mapping artifact, never in a reusable rule.

## Normative keywords

- **MUST / MUST NOT**: hard invariant. Violation is `FAIL`.
- **SHOULD / SHOULD NOT**: default requirement. Deviation requires explicit evidence and an approved project-specific exception.
- **MAY**: optional behavior.
- **BLOCKED**: required evidence or authority is missing; the agent must stop rather than guess.

## Conflict policy

When two authoritative artifacts appear to conflict, the agent MUST NOT choose the interpretation it prefers.

1. Apply the artifact authority rule.
2. If the conflict remains unresolved, return `BLOCKED` with the conflicting clauses and required decision.
3. Never silently weaken a hard invariant to make an implementation pass.

## Reuse policy

A rule fails the reuse test if it requires any concrete project path, named spec number, named product, named database, named engine, named framework, or one-off historical event to make sense.

Project bindings MAY map abstract concepts such as `SPEC_ROOT`, `RUNTIME_ROOTS`, `ARCHITECTURE_TESTS`, and `PROJECT_VALIDATION_COMMANDS` to concrete repository values outside this directory.
