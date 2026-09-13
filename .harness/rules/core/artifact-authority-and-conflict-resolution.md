# Rule — Artifact Authority and Conflict Resolution

**Rule ID:** CORE-AUTHORITY-001  
**Severity:** MUST  
**Applies to:** every implementation, refactor, review, migration, and documentation update

## Invariant

The agent MUST use a deterministic authority order and MUST stop when an unresolved conflict remains. It may not select the most convenient interpretation.

## Authority order

For a project-specific behavior decision, use this order:

1. Explicit current user/task directive.
2. Current project specification governing the behavior.
3. Project-specific architecture contract or impact contract explicitly referenced by that specification.
4. Reusable hard rules.
5. Runtime contracts/types and executable tests as evidence of current implementation.
6. Reusable skills as procedure.
7. Lessons, walkthroughs, reports, plans, and examples as supporting evidence only.

## Important distinction

- **Specifications describe the intended project behavior.**
- **Code and tests prove the current implementation.**
- If code contradicts a still-valid specification, the agent MUST classify the condition as an implementation divergence; it MUST NOT rewrite the specification merely to legitimize the bug.
- If the specification is demonstrably obsolete because a newer explicit project decision superseded it, update the specification and dependent artifacts in the same change.

## Conflict decision table

| Situation | Required action |
|---|---|
| Spec and code agree | Proceed. |
| Code differs from valid spec | Fix code or return `BLOCKED`; preserve the spec invariant. |
| New explicit project decision supersedes old spec | Update spec first or atomically with code. |
| Two specs conflict and no precedence is declared | `BLOCKED`; report exact clauses. |
| Rule conflicts with explicit project requirement | Require an explicit project exception; do not infer one. |
| Evidence is missing | `BLOCKED`; do not assume success. |

## Evidence required

Every non-trivial decision MUST cite the authoritative artifact and the observed implementation evidence used to reach it.
