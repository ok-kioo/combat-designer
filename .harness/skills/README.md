# Reusable Skills Contract

Skills in this directory are **procedures**, not project documentation. They must remain portable across repositories.

## Mandatory structure

Every skill SHOULD define:

- `Purpose`
- `Trigger`
- `Inputs`
- `Preconditions`
- `Authoritative Sources`
- `Procedure`
- `Decision Table`
- `Required Evidence`
- `Failure / Block Conditions`
- `Expected Output`

## Binding policy

Reusable skills MUST NOT hardcode concrete repository paths, spec numbers, package names, vendors, framework names, product entities, or one-off commands.

Concrete project values are supplied through project bindings such as:

- `SPEC_ROOT`
- `RULE_ROOT`
- `LESSON_ROOT`
- `RUNTIME_ROOTS`
- `ARCHITECTURE_TESTS`
- `PROJECT_VALIDATION_COMMANDS`
- `SIMULATION_COMMANDS`
- `PROJECT_MAPPING`

If a required binding is absent, the skill returns `BLOCKED` rather than guessing.

## Procedure discipline

When a skill trigger matches, execution is mandatory unless the project explicitly declares a different procedure. The agent must not replace a skill with an improvised workflow merely because it seems faster.
