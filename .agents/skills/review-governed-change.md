# Agent Skill — Review a Governed Change

## Purpose

Review an implementation against project authority without re-designing the solution based on reviewer preference.

## Procedure

1. Resolve project bindings and governing specs.
2. Determine which mandatory rules/skills applied to the change.
3. Verify the implementation actually followed them.
4. Check behavior, architecture, security, migrations, stale references, and evidence.
5. Distinguish:
   - requirement violation;
   - implementation bug;
   - stale documentation;
   - missing evidence;
   - optional improvement.
6. Do not fail a change for personal style preference when no rule/spec is violated.
7. Do not pass a change when a hard invariant or mandatory check is missing.

## Review outcome

- `PASS`: conforms with evidence.
- `FAIL`: concrete violation with authoritative reference.
- `BLOCKED`: required evidence/authority unavailable.
- `PASS_WITH_FOLLOWUPS`: only when all mandatory requirements pass and remaining items are explicitly non-blocking improvements.
