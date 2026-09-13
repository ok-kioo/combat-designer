# Skill — Sequential Task Breakdown

## Purpose

Convert a feature/change into ordered, independently verifiable tasks with explicit dependencies and rollback points.

## Trigger

Use for any change spanning more than one architectural boundary, persistence contract, runtime layer, or user-visible capability.

## Inputs

- desired behavior;
- affected project specs;
- current architecture;
- identified risks/migrations.

## Mandatory task schema

Each task MUST declare:

```yaml
id:
preconditions:
action:
expected_result:
verification:
artifact:
depends_on:
affected_capabilities:
rollback_or_recovery:
```

## Default ordering

Use this order unless project specs prove another dependency order is required:

1. acceptance behavior / Given-When-Then;
2. owning domain and invariants;
3. typed contracts;
4. canonical model;
5. application ports/use cases;
6. infrastructure/persistence migration;
7. deterministic computation;
8. runtime analysis/diagnostics;
9. tool/API/delivery integration;
10. UI/product interaction;
11. observability;
12. docs/specs/impact artifacts;
13. regression and architecture verification.

## Rules

- One task MUST NOT hide unrelated domain changes.
- A downstream task may rely only on artifacts produced by completed dependencies, not implicit local state.
- Migration tasks precede consumers of the new schema/contract.
- Security/authorization boundaries are established before exposing new delivery/tool surfaces.
- A task cannot be marked done without its declared verification evidence.

## Decision table

| Change spans | Required split |
|---|---|
| contract + implementation | contract first, implementation second |
| schema + consumer | migration/schema first, consumer second |
| core + adapter + UI | core, adapter, UI as separate dependent tasks |
| behavior + refactor | refactor baseline/equivalence and behavior change separately |
| runtime + harness | separate runtime implementation from development-governance updates |
