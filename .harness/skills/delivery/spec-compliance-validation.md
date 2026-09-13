# Skill — Specification Compliance Validation

## Purpose

Determine whether an implementation/documentation change conforms to the project-specific specifications and declared architecture before it can be considered complete.

This is a **development-governance** procedure. It never runs as product runtime logic.

## Trigger

Mandatory before declaring `DONE` for:

- structural refactors;
- new or modified project specs;
- public contract/API changes;
- persistence/schema changes;
- security/authorization changes;
- architecture-boundary changes;
- changes whose task explicitly requires spec compliance.

## Inputs

- changed files/diff;
- affected project specifications;
- project impact/traceability artifacts, if the project uses them;
- architecture-test bindings;
- project validation commands.

## Preconditions

- authoritative project spec root is bound;
- changed areas are identified;
- repository revision is stable enough to validate.

## Checks

1. `SPEC_ALIGNMENT` — implementation matches the governing specification, or the specification is atomically updated by an explicitly approved project decision.
2. `CROSS_SPEC_IMPACT` — all semantically dependent specs/contracts are inspected, not only textual matches.
3. `PATH_AND_SYMBOL_TRUTH` — project-specific paths/symbols cited by project specs exist after the change.
4. `IMPACT_TRACEABILITY` — required feature-impact/migration records exist and validate.
5. `NO_SILENT_ARCHITECTURE_CHANGE` — architecture boundaries/tests reflect structural changes.
6. `INVARIANT_PRESERVED` — valid invariants from other specs remain intact.
7. `TEST_EVIDENCE` — required build/type/test/architecture checks executed successfully.
8. `RUNTIME_HARNESS_SEPARATION` — development-governance artifacts are not runtime dependencies.
9. `NO_STALE_REFERENCES` — renamed/removed contracts and paths have no unintended authoritative references.

## Verdict

```text
PASS    = every mandatory check has evidence and passed
FAIL    = a mandatory check has evidence of violation
BLOCKED = a mandatory check cannot be established
STALE   = validation evidence belongs to an older revision
```

`BLOCKED` and `STALE` are never `PASS`.

## Required evidence

For each check record:

```yaml
check:
status:
authoritative_source:
evidence:
command_or_query:
notes:
```

## Failure policy

If code and a valid spec disagree, do not choose which one to keep based on convenience. Apply the artifact authority rule and return `BLOCKED` if no explicit superseding decision exists.
