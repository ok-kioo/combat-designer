# Navigation Authority and Served UI Evidence

## Context
An application grows from a prototype with several screens in one document.
## Problem Pattern
Screen visibility imitates routing. More-specific styles override hiding, URLs lose page identity,
and isolated controller tests pass while the delivered UI is broken.
## Why It Matters
History, reload, deep links and authenticated navigation all depend on the same authoritative state.
Testing a second renderer creates false confidence about the actual product.
## General Principle
Route state owns navigation; CSS only presents the selected page. Verify the runtime entry users receive.
## Detection
Look for view IDs, global navigation handlers, sibling page trees, and tests importing modules unused by delivery.
## Recommended Approach
Inventory the real entry; map URLs and resource context; use one router and nested layouts; separate session
bootstrap from destination selection; test browser lifecycle against the served bundle.
## Anti-Patterns
Adding display:none !important as a final architecture; token-driven public redirects; copying production
logic into test-only controllers; claiming success from source string assertions alone.
## Validation
Demonstrate exclusive rendering, URL state, back/forward, reload, direct/new-tab access, guards and stale-response isolation.
## Related Rule/Skill IDs
ARCH-NAV-001; routing-refactoring.
## Current Harness Mapping
See `.harness/docs/architecture/frontend-routing.md` and `.harness/docs/architecture/frontend-routing-walkthrough.md`
for this project's implementation and evidence. Core principles above are reusable.
