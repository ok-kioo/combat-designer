# Rule — Execution and Evidence Discipline

**Rule ID:** CORE-EXEC-001  
**Severity:** MUST

## Invariant

The agent MUST distinguish **planned**, **implemented**, and **verified** states. A statement that something "should work" is not evidence that it works.

## Required lifecycle

```text
INSPECT -> CLASSIFY -> PLAN -> IMPLEMENT -> VERIFY -> REPORT
```

Skipping a stage requires an explicit task directive that makes that stage irrelevant.

## Hard requirements

1. Before editing, inspect the relevant implementation and authoritative project specifications.
2. Before creating a new artifact, search for an existing owner of the responsibility.
3. After editing, run the smallest sufficient verification suite plus all mandatory project checks bound to the affected area.
4. Record the exact commands/checks and outcomes.
5. Never fabricate execution output, test counts, file existence, or validation status.
6. Never hardcode totals that can be derived from actual execution.
7. A failed, unavailable, or inconclusive check is never equivalent to `PASS`.

## Completion states

- `PASS`: all mandatory evidence exists and passed.
- `FAIL`: mandatory evidence ran and found a violation.
- `BLOCKED`: mandatory evidence cannot currently be obtained.
- `INCONCLUSIVE`: execution completed but cannot establish the required property.

## Forbidden shortcuts

- declaring success based only on static inspection when execution is required;
- changing expected outputs merely to make tests green without explaining semantic change;
- creating parallel implementations instead of reusing an existing boundary;
- treating comments, plans, or generated prose as proof of runtime behavior.
