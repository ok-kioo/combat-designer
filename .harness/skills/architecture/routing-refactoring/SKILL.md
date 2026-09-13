---
name: routing-refactoring
description: Refactor top-level application navigation into one route authority while preserving session, resource context, browser history and the served application path.
---
# Routing Refactoring

## purpose
Replace conflicting navigation state without losing product capabilities or authorization boundaries.

## when_to_use
Use when migrating top-level navigation, correcting URL/view divergence, or replacing a visibility router.

## inputs
Current runtime entry, dependency manifest, page inventory, session/resource owners, authoritative behavior,
deployment fallback and navigation tests.

## preconditions
Inspect the served entry and actual dependencies before selecting a router. A requested router choice wins;
otherwise reuse the installed owner. Capture a baseline before removing legacy behavior.

## authoritative_sources
User decisions, governing route/auth specifications, actual API contracts, runtime imports and served output.
Do not infer production behavior from a similarly named test controller.

## allowed_actions
Extract pages/layouts, introduce the authorized router, preserve API clients, add safe guards and fallback,
add served-app browser tests and update bound architecture/spec artifacts.

## forbidden_actions
Do not add a parallel router, treat token presence as resource authorization, accept arbitrary return URLs,
retain sibling top-level DOM trees as the routing mechanism, or claim browser verification from string tests.

## procedure
1. Map screen -> implementation -> URL -> session requirement -> resource context -> defect -> destination.
2. Assign one owner each for navigation, session, resource data and authorization.
3. Separate structural extraction from intentionally changed redirect behavior.
4. Migrate public/auth routes, then nested protected layouts and feature pages.
5. Make route identity select resource context; invalidate stale data on identity change.
6. Preserve loading/error/empty states and safe async cancellation.
7. Configure document fallback separately from APIs/static files.
8. Verify the actual served app, then remove visibility router and stale navigation references.

## validation
Test direct entry, reload, back/forward, new tab, safe/unsafe return paths, valid/expired sessions,
resource denial, async navigation races, keyboard access and responsive layout.

## evidence_required
Dependency versions, migration matrix, before/after route ownership, actual commands/results and browser evidence.

## failure_modes
URL/page divergence, double mounting, overwritten public destinations, stale resource responses,
open redirects, server 404 before bootstrap, and tests exercising a different delivery path.

## expected_outputs
One route tree, decomposed pages/layouts, explicit guards, regression tests, updated behavior contracts and
an evidence report distinguishing verified behavior from remaining gaps.

## architecture_invariants
URL/router = navigation; session = identity; route resource context = selected resource; backend = authorization;
CSS = presentation. Development artifacts are not runtime dependencies.
