# Rule — Deterministic Computation and Analysis

**Rule ID:** ANALYSIS-DETERMINISM-001  
**Severity:** MUST  
**Applies when:** results are expected to be reproducible from explicit inputs

## Invariants

1. Identical explicit inputs MUST produce identical authoritative outputs.
2. Gameplay/domain timing MUST use discrete deterministic units when the project requires frame/tick determinism; floating-point gameplay decisions are prohibited unless explicitly specified and tested.
3. Event ordering MUST be total and documented for ties.
4. Randomness MUST be seeded and supplied explicitly.
5. Wall-clock time MUST NOT influence deterministic outcomes.
6. Resource/search budgets MUST be explicit inputs or project-bound configuration with stable semantics.
7. Budget exhaustion MUST produce an explicit incomplete result, never a successful conclusion.
8. State/output hashes, when used, prove integrity/reproducibility of data, not authenticity or authorization.
9. Analysis MUST preserve evidence linking conclusions to authoritative input/result data.
10. An analysis result informs; it MUST NOT silently become a development acceptance gate or a user-facing approval verdict.

## Validation

For a change that can affect deterministic behavior:

- run repeated identical scenarios;
- compare deterministic hashes or canonical serialized output;
- verify event ordering;
- test budget exhaustion;
- test overflow/bounds behavior;
- record evidence.

A coding agent MUST NOT claim deterministic compliance without executable evidence.
