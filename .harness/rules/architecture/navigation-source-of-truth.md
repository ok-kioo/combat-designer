# Rule — Navigation Has One Authority

**Rule ID:** ARCH-NAV-001  
**Severity:** MUST

## Invariant
Top-level application navigation has one source of truth. When routes exist, URL/router state
is authoritative for the active page. CSS visibility must not act as the application router.
Authentication determines identity, resource context follows route identity, and server authorization
determines resource access. These authorities must not be conflated.

## Enforcement
Inactive top-level pages must not be mounted as sibling screens waiting for visibility toggles.
Nested layouts may persist shared UI. Local disclosure/tab state is permitted within a page
when it does not represent top-level navigation. Tests must exercise the actual served entry,
not only detached controllers or a parallel renderer. Include history, refresh, direct entry,
unauthenticated redirects, and safe internal return destinations in navigation regression coverage.
