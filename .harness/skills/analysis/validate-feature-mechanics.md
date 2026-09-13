# Skill — Validate Deterministic Feature Mechanics

## Purpose

Validate that a code change affecting deterministic mechanics preserves declared invariants, reproducibility, and project-specific mechanical requirements.

This is exclusively a **development-governance** skill. `PASS` / `FAIL` / `BLOCKED` refer to implementation acceptance, never to approval of user content.

## Trigger

Mandatory when a change affects any of:

- deterministic simulation/state transition logic;
- timing/frame/tick calculations;
- event ordering;
- seeded randomness;
- mechanical analysis/diagnostic algorithms;
- state/output hashing;
- search/solver mechanics;
- resource/budget handling;
- serialization that affects deterministic comparison.

## Inputs

- code diff/change description;
- affected mechanical specifications;
- deterministic scenarios/fixtures;
- baseline results when equivalence is expected;
- project-bound simulation/test commands.

## Preconditions

- code compiles/typechecks as applicable;
- governing mechanical requirements are identified;
- deterministic fixtures/scenarios exist or are created first.

## Procedure

1. Identify every invariant potentially affected.
2. Select or create the smallest scenarios that exercise each invariant.
3. Run each scenario with explicit identical inputs repeatedly.
4. Compare canonical serialized results and/or deterministic hashes.
5. Verify total event ordering and tie-breaking behavior.
6. Verify bounds/overflow behavior.
7. Verify budget exhaustion produces an explicit incomplete outcome.
8. Run mechanical regression tests.
9. Compare diagnostics/findings to baseline when analysis behavior should be unchanged.
10. Record evidence and then invoke specification-compliance validation.

## Repeat-count policy

Use the repeat count bound by the project. If no count is bound, use at least two identical runs for basic determinism and a higher repeat count for critical deterministic paths; report the chosen count rather than inventing a project mandate.

## Required evidence

- input fixture/scenario identity;
- repeated output/hash comparison;
- relevant test commands and results;
- diagnostic/finding diff where applicable;
- spec-compliance checklist.

## Failure conditions

- identical inputs produce divergent authoritative output;
- nondeterministic tie ordering;
- unmodeled wall-clock/random/environment dependency;
- unexplained budget exhaustion;
- required evidence missing;
- regression tests fail;
- valid project mechanical requirement is violated.

## Expected output

```text
PASS    - required mechanical invariants verified with evidence
FAIL    - at least one invariant violated; evidence identifies it
BLOCKED - environment, fixture, binding, or prerequisite prevents verification
```
