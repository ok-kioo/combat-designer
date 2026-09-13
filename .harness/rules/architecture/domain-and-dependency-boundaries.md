# Rule — Domain and Dependency Boundaries

**Rule ID:** ARCH-BOUNDARY-001  
**Severity:** MUST

## Invariant

Core domain behavior MUST remain independent from delivery frameworks, persistence drivers, agent protocols, UI frameworks, file systems, external engines, wall clocks, and vendor-specific infrastructure.

## Canonical dependency direction

```text
External Input / UI / Agent
        ↓
Delivery / Gateway / Controllers
        ↓
Application / Use Cases
        ↓
Domain + Deterministic Computation
        ↑
Ports implemented by Infrastructure
```

Read models, indexes, caches, search projections, and graph projections are downstream representations. They MUST NOT become canonical domain truth unless a project specification explicitly assigns that role.

## Hard boundaries

- Domain MUST NOT import concrete infrastructure or delivery code.
- Application MUST orchestrate through typed contracts/ports rather than concrete persistence drivers.
- Delivery/tool layers MUST NOT write directly to persistence or projections when an application boundary exists.
- Imported external representations MUST be normalized before entering canonical domain logic.
- Agent/model-generated data MUST NOT directly mutate canonical state.
- Wall-clock time, sleeps, randomness, environment state, or telemetry MUST NOT influence deterministic domain outcomes unless supplied as explicit modeled input.
- Runtime MUST NOT depend on development harness artifacts.

## Cross-boundary contracts

Crossing a boundary requires an explicit typed DTO, command, query, event, or port. Silent sharing of internal persistence/driver types across layers is prohibited.

## Enforcement

Architecture tests SHOULD assert forbidden dependency directions. When a project binds concrete roots, the checks MUST cover every runtime root, not a hand-picked subset.
