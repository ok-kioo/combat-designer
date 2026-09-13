# Harness Entry Point

## Read order for implementation agents

1. Resolve project bindings from the agent manifest/project mapping.
2. Read the governing project specification(s) for the requested behavior.
3. Apply all reusable Rules whose trigger/scope matches the change.
4. Execute every Skill whose trigger matches the change.
5. Use Lessons only as explanatory guidance; they do not override specs/rules.
6. Implement.
7. Run mandatory project validation.
8. Produce evidence and verdict.

## No-choice rule

When a trigger matches a Rule/Skill, the agent does not choose whether to apply it. It is mandatory unless the governing project specification explicitly declares an exception.

When two authoritative artifacts conflict and no precedence resolves them, return `BLOCKED`; never pick a preferred interpretation.

## Artifact roles

- `specs/`: project-specific behavior and architecture.
- `rules/`: reusable invariants.
- `skills/`: reusable procedures.
- `lessons/`: reusable learned patterns.
- `docs/feature-impacts/`: project-specific change impact contracts.
- `docs/architecture/`: project-specific architecture documentation.
- `docs/project-context/`: project bindings that connect reusable procedures to this repository.
