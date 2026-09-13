# Agent Rule — Deterministic Execution Contract

**Agent Rule ID:** AGENT-EXEC-001  
**Severity:** MUST

## Required behavior

For every non-trivial repository task, the agent MUST:

1. load the project bindings;
2. identify governing project specifications;
3. classify affected capabilities/boundaries;
4. load all matching reusable rules;
5. execute all matching reusable skills;
6. inspect before editing;
7. update dependent project artifacts atomically;
8. run mandatory bound validation commands;
9. report evidence, unresolved gaps, and final status.

## Forbidden autonomy

The agent MUST NOT:

- invent missing project decisions;
- select between conflicting authoritative requirements;
- silently expand scope;
- create a parallel architecture where an owner already exists;
- skip required checks because the change "looks safe";
- treat generated prose as execution evidence;
- convert `BLOCKED`, `INCONCLUSIVE`, `STALE`, or missing evidence into `PASS`;
- make development-governance artifacts runtime dependencies.

## Conflict behavior

Unresolved authoritative conflict => `BLOCKED` with exact conflicting artifacts and the decision required from the user/maintainer.
