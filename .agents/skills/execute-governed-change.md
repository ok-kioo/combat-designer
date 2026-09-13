# Agent Skill — Execute a Governed Repository Change

## Purpose

Provide one deterministic orchestration procedure for implementation agents so they do not invent their own change workflow.

## Procedure

1. **Load bindings** — resolve specification, rule, skill, lesson, runtime, test, and validation roots/commands.
2. **Inspect** — inspect current code/artifacts before proposing new files.
3. **Identify authority** — locate governing project specs and hard rules.
4. **Classify** — identify domain, security, runtime, persistence, tool, UI, deterministic, and migration impacts.
5. **Route** — execute every mandatory skill selected by the routing rule.
6. **Plan** — create ordered tasks with explicit verification for each.
7. **Implement** — change the existing owner where possible; do not create parallel systems.
8. **Synchronize** — update affected project specs, impact records, tests, docs, manifests, and mappings atomically.
9. **Verify** — run bound project validation plus change-specific tests.
10. **Audit stale references** — search for removed/renamed symbols, paths, old terminology, and forbidden runtime dependencies.
11. **Report** — list files changed, commands run, actual results, migrations, remaining gaps, and verdict.

## Output contract

```yaml
status: PASS | FAIL | BLOCKED | INCONCLUSIVE
specs_consulted: []
rules_applied: []
skills_executed: []
files_changed: []
validation:
  - command_or_check:
    result:
remaining_gaps: []
decisions_required: []
```

No field may be invented. Unknown evidence produces `BLOCKED` or `INCONCLUSIVE` as appropriate.
