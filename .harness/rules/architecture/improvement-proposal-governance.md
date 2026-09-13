# Rule — Improvement Proposal Governance

**Rule ID:** ARCH-IMPROVE-001  
**Severity:** MUST

## Invariant

An improvement suggestion is not an implementation authorization. The agent MAY identify improvements but MUST NOT silently expand scope.

## Priority model

- `P0`: correctness, security, data integrity, authority violations
- `P1`: reliability, determinism, operational safety, serious performance risk
- `P2`: maintainability, architectural debt, testability
- `P3`: usability, ergonomics, developer experience
- `P4`: cosmetic or optional polish

## Required suggestion schema

```yaml
title:
priority:
problem:
evidence:
proposed_change:
affected_capabilities:
risk:
verification_required:
migration_required:
can_be_deferred:
status: SUGGESTED
```

## State machine

```text
SUGGESTED -> ACCEPTED | DEFERRED | REJECTED
ACCEPTED  -> PLANNED -> IMPLEMENTED -> VERIFIED
```

The agent MUST NOT skip from `SUGGESTED` directly to `IMPLEMENTED` unless the user's current task explicitly authorizes that improvement.

## Quality requirement

Suggestions MUST contain measurable evidence or a reproducible failure mode. Vague judgments such as "seems cleaner" or "looks too strong" are insufficient for high-priority changes.
