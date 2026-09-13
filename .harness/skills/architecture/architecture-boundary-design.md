# Skill — Architecture Boundary Design

## Purpose

Design or review module boundaries so business/domain rules remain independent, replaceable, testable, and free of infrastructure authority leakage.

## Trigger

Use when adding or changing modules, packages, services, adapters, gateways, persistence, runtime orchestration, or cross-layer dependencies.

## Inputs

- affected capabilities;
- current dependency graph;
- project specifications;
- existing architecture tests;
- project bindings describing runtime roots and validation commands.

## Preconditions

- identify the domain owner of each behavior;
- identify canonical persistence/read-model ownership;
- identify trust boundaries;
- identify deterministic computation boundaries.

## Canonical responsibility model

```text
Domain               = business invariants and canonical concepts
Application          = use-case validation and orchestration
Ports                = abstractions required by inner layers
Infrastructure       = concrete external adapters
Delivery/Gateway     = authentication/policy/routing/transport
Deterministic Engine = reproducible computation from explicit inputs
Analysis             = findings/diagnostics/evidence from authoritative results
Agent/LLM            = intent interpretation and explanation, never source of domain truth
Observability        = observation only, never authorization or domain authority
```

## Procedure

1. Map each changed responsibility to exactly one owning layer/capability.
2. Identify every new dependency edge.
3. Reject dependency edges that point from inner/core layers to outer/concrete layers.
4. Require typed contracts at every boundary.
5. Separate canonical state from derived read models/projections.
6. Separate runtime analysis from development governance.
7. Keep agent/model outputs non-authoritative unless revalidated by application/domain logic.
8. Add/update architecture tests for every new forbidden/allowed edge.
9. Run project-bound architecture and regression checks.

## Decision table

| Question | If yes | If no |
|---|---|---|
| Is this business/domain logic? | Core domain/application owner. | Continue classification. |
| Does it depend on a vendor/driver/framework? | Adapter/infrastructure/delivery. | May remain inner-layer. |
| Is it derived for query/search/exploration? | Read model/projection, not canonical truth. | Continue classification. |
| Is it an LLM decision? | Treat as untrusted proposal/interpretation. | Continue classification. |
| Is it code acceptance governance? | Development harness only. | Runtime may own if genuine product behavior. |

## Required evidence

- dependency graph or import evidence;
- architecture tests;
- affected specification references;
- executed validation results.

## Failure / Block conditions

`FAIL` on forbidden dependency or authority leakage.  
`BLOCKED` when ownership cannot be resolved from project specs without an explicit decision.
