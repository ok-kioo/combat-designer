# Rule — Refactoring Safety

**Rule ID:** ARCH-REFACTOR-001  
**Severity:** MUST  
**Trigger:** any change described as refactor, cleanup, reorganization, extraction, rename, consolidation, or decomposition

## Invariant

A refactor MUST preserve externally observable semantics unless the task explicitly includes a behavior change. Behavior changes and refactoring must be classified separately even when delivered together.

## Mandatory preconditions

Before refactoring, the agent MUST answer with evidence:

1. What problem requires structural change?
2. Which boundaries and contracts are affected?
3. What executable baseline freezes current behavior?
4. Does the change affect domain behavior, timing, deterministic output, authorization, persistence semantics, or external contracts?
5. Is a migration required?

If baseline evidence is missing and semantic equivalence matters, return `BLOCKED` or first add a characterization test.

## Procedure

1. Capture baseline tests/fixtures/traces relevant to the changed behavior.
2. Separate structural edits from intentional semantic edits in the plan.
3. Perform the structural change without modifying domain semantics.
4. Re-run the same baseline evidence.
5. Compare outputs that define equivalence: states, events, serialized contracts, deterministic hashes, diagnostics, or externally visible API behavior as applicable.
6. Only then perform separately specified behavior changes.

## Forbidden

- hiding a behavior change inside "cleanup";
- updating snapshots solely to conceal regression;
- refactoring because a model suggested it without project need/evidence;
- introducing a second architecture beside an existing valid abstraction;
- using a governance artifact as a runtime dependency.

## Acceptance

`PASS` requires demonstrated semantic equivalence for refactor-only changes. Any intentional difference MUST be covered by an explicit project requirement and dedicated verification.
