# Rule — Runtime vs. Development Governance Separation

**Rule ID:** ARCH-LIFECYCLE-001  
**Severity:** MUST

## Invariant

Development-time acceptance mechanisms MUST NOT become runtime product authorities unless the product domain explicitly requires approval semantics as a business feature.

## Required separation

```text
PRODUCT RUNTIME
  -> domain facts / results / diagnostics / evidence / recommendations

DEVELOPMENT GOVERNANCE
  -> specs / rules / skills / tests / implementation acceptance
```

## Corollaries

1. Runtime code MUST NOT import or require development-governance artifacts.
2. Development verdicts such as `PASS`, `FAIL`, `BLOCKED`, or `APPROVED` MUST NOT be reused as user-facing domain states unless they are genuine business concepts defined by project specs.
3. An analysis result informs; an implementation gate accepts or rejects code. They are not interchangeable.
4. Renaming a gate to "verification" does not remove gate semantics if runtime progression still depends on its verdict.
5. Useful algorithms MAY be shared or extracted, but approval wrappers and development governance remain outside runtime.

## Decision table

| Mechanism | Runtime allowed? | Development allowed? |
|---|---:|---:|
| deterministic calculation | yes | yes |
| domain diagnostic/finding | yes | yes as evidence |
| recommendation | yes | no authority over code acceptance |
| code/spec compliance verdict | no | yes |
| CI/build gate | no | yes |
| automatic mutation justified only by a dev gate | no | no |

## Failure behavior

If a runtime path depends on a development verdict, classify it as an architectural violation and require removal, disconnection, or redesign. Do not merely relabel it.
