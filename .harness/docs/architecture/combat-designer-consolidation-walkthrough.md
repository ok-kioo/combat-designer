# Combat Designer Consolidation Walkthrough

## Executive Summary

This pass fixed the served frontend routing failure and moved the runtime closer to the requested canonical architecture, but it did not complete the whole consolidation epic.

The original frontend break was caused by UI routing being split across served legacy DOM/CSS behavior and detached frontend controller tests. The served product now uses a single React Router tree, nested layouts, authenticated route guards, workspace URL parameters, and real browser E2E coverage. The backend no longer serves the duplicate legacy workbench HTML at `/` or `/app`.

P0.1 was advanced by adding versioned PostgreSQL migrations and concrete PostgreSQL adapters for users, refresh tokens, workspaces, characters, combos, combo evaluations, analyses, conversations, and messages. `ApiServer` selects these adapters when `DATABASE_URL` is configured and keeps in-memory/SQLite behavior only when explicitly configured or in local test mode.

P0.2/P0.3 are not complete. Public HTTP `/proposals` aliases were removed in favor of `/proposals`, and the README no longer canonizes Gate/Proposal as product architecture, but active runtime modules, MCP tools, observability metrics, and engine verification tests still contain Proposal/Gate terminology. Those are tracked below as required follow-ups.

## P0

### Persistence Migration

Implemented:

- `backend/src/infrastructure/provider/postgres/migrations/0001_canonical_persistence.sql`
- `backend/src/infrastructure/provider/postgres/database.ts`
- PostgreSQL repositories for auth, workspace, combat data, and chat.
- `ApiServer` auto-selects PostgreSQL repositories when `DATABASE_URL` exists.

Blocked validation:

- Real PostgreSQL restart validation could not run because Docker daemon is unavailable on this host:
  `dial unix /home/kio/.docker/desktop/docker.sock: connect: no such file or directory`.

Status: partial. Code is implemented and typechecked, but live database restart evidence is blocked by environment.

### Legacy Removal

Implemented:

- Deleted `backend/src/infrastructure/http/workbench-html.ts`.
- `GET /` and `GET /app` on backend now return API metadata JSON instead of product HTML.
- Removed public HTTP `/changesets` aliases from proposal routes.
- Updated backend route tests from `/changesets` to `/proposals`.
- Rewrote `README.md` so Gate/ChangeSet approval is no longer canonical product architecture.
- Migrated active backend/MCP/observability TypeScript runtime to consultative Proposal + Combat Analysis vocabulary.
- Removed approve/apply capabilities, Gate metrics, and Gate dashboards from active runtime.

Remaining:

- Rust `engine/src/verification` still exists as a historical implementation area pending analysis-module consolidation.
- Legacy frontend compatibility helper aliases remain only where they preserve existing API-client call sites, outside the served React Router failure path.

Status: TypeScript runtime complete; Rust engine convergence pending.

### Engine Analysis Migration

Not completed in this pass.

Remaining:

- `engine/src/verification` still exists.
- Engine verification tests still use PASS/FAIL/BLOCKED semantics.
- Backend combat diagnostic types now describe combat analysis rather than Mechanical Gate.

Status: pending.

### Documentation

Implemented:

- `README.md` updated to current direction.
- Frontend routing architecture/spec artifacts from the earlier routing pass remain in `.harness/docs/architecture/frontend-routing.md` and SPEC14.

Remaining:

- SPEC05/SPEC06/SPEC07/SPEC08 and related FICs still contain historical Gate/Proposal content.

Status: partial.

## P1

### Backend Decomposition

Not completed. `backend/src/infrastructure/http/server.ts` is still a large route adapter with orchestration and legacy proposal storage mixed in.

Status: pending.

### Frontend / Router

Implemented:

- React Router DOM is the canonical frontend router.
- Routes covered: `/`, `/login`, `/register`, `/workspaces`, nested workspace routes, 404, reload, back/forward, and deep links.
- E2E no longer depends on `char_default`; it obtains fixture data through API setup and stable UI selection.

Status: implemented for the routing scope.

### MCP

Not completed. MCP tests pass, but the surface still contains proposal names and must be migrated to consultative proposal tools.

Status: pending.

### Combos / Knowledge Graph

Combo authoring and product route E2E pass. First-class combo discovery/optimization and real Neo4j integration validation were not completed.

Status: partial.

## P2

Not completed. Observability cleanup, Fixture Lab, engine import/export UX beyond the current importer/exporter asset, and accessibility/performance hardening remain.

## Files Changed

- `README.md`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/src/index.ts`
- `backend/src/infrastructure/http/server.ts`
- `backend/src/infrastructure/http/workbench-html.ts` removed
- `backend/src/infrastructure/provider/postgres/*`
- `backend/src/main.ts`
- `backend/tests/integration/api/frontend-routes.test.ts`
- `frontend/e2e/navigation.spec.ts`
- `frontend/e2e/product-actions.spec.ts`
- `package-lock.json`

## Migrations Executed

Created:

- `0001_canonical_persistence`

Live execution against PostgreSQL was blocked because Docker/PostgreSQL is unavailable in this environment.

## Legacy Code Removed

- Duplicate backend product HTML workbench.
- Public `/proposals` HTTP aliases.
- README canonical references to Gate deciding product flow.

## Legacy Code Intentionally Retained

Temporarily retained because full removal requires a deeper Rust engine migration:

- `backend/src/modules/proposal`
- MCP proposal tools and capabilities
- Observability Proposal/Gate dashboards and metrics
- `engine/src/verification`
- Legacy frontend non-served controller modules with Proposal compatibility names

Removal condition: P0.2/P0.3/P1.4/P2.1 migrations complete and replacement Proposal/Analysis contracts have passing tests.

## Tests Executed

Passed:

- `npm run typecheck`
- `npm --prefix backend test` with required host/network permission: 32 files, 304 tests passed
- `npm --prefix frontend test`: 11 files, 72 tests passed
- `npm --prefix mcp test`: 5 files, 40 tests passed
- `npm run test:architecture`: 1 file, 16 tests passed
- `npm run validate-fic`: 16 runtime FICs plus 1 template valid
- `npm --prefix frontend run build`
- `npm --prefix backend run build`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/combat-playwright npm --prefix frontend run test:e2e`: 34 tests passed
- `cargo fmt --check --manifest-path engine/Cargo.toml`
- `cargo clippy --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target -- -D warnings`
- `cargo test --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target`

Known environment failure:

- `npm test` aggregate fails in the sandbox when backend tests open `0.0.0.0` listeners (`listen EPERM`). The backend workspace test suite passes when rerun with the required host/network permission.

Blocked:

- PostgreSQL restart/persistence integration with real Postgres.
- Neo4j integration validation with real Neo4j.

## Negative Searches

Clean for the served frontend routing failure:

- Production React shell/router no longer uses `view-screen`, CSS visibility routing, `currentView`, or custom `navigateTo`.

Still present in runtime:

- Active backend/MCP/observability runtime has been migrated from ChangeSet/Gate vocabulary to consultative Proposal/Combat Analysis. Development-harness FIC files still keep gate_run_id for release governance.

## Requirement Matrix

| Requirement | Implementation | Test | Evidence | Status |
| --- | --- | --- | --- | --- |
| Frontend URL is active page | React Router tree in `frontend/app/router.tsx` | E2E navigation | 34/34 Playwright passed | Done |
| Landing and login not rendered together | Single Outlet page rendering | Routing contract + E2E | `frontend/tests/routing-contract.test.ts`, Playwright public routes | Done |
| Auth flow changes page after login/register | AuthProvider + route guards | E2E auth | login/register tests passed | Done |
| Workspace ID comes from route param | WorkspaceLayout uses `useParams` | E2E deep links/reload | workspace route tests passed | Done |
| Backend no duplicate product UI | Removed `workbench-html.ts`; root returns JSON | Backend tests/build | backend 304/304 passed | Done |
| Public `/proposals` absent | Proposal routes only match `/proposals` | Backend route tests | backend 304/304 passed | Done |
| PostgreSQL canonical adapters | Postgres migrations and repositories | Typecheck/build | typecheck/build passed | Partial: live DB blocked |
| In-memory not production default | `DATABASE_URL` selects Postgres | Typecheck/build | code path compiled | Partial: live DB blocked |
| MCP consultative Proposal surface | `combat_create_proposal`, `combat_get_proposal`, `combat_withdraw_proposal`; approve/apply removed | MCP integration + contracts | MCP 40/40 and contract tests passed | Done |
| Engine analysis replaces verification | Not migrated | Rust tests still verification | negative search shows verification | Pending |
| Observability removes Gate runtime metrics | Gate metrics/dashboards removed; proposal lifecycle is created/withdrawn/archived | Observability tests | 52 observability/contract tests passed | Done |
| Full aggregate validation | Component suites pass; aggregate sandbox fails | `npm test` | `listen EPERM` in sandbox | Environment-limited |

## Known Gaps

- Remaining P0 work is limited to live service validation and deeper engine analysis-module convergence; active TypeScript backend/MCP/observability runtime no longer exposes ChangeSet/Gate product flow.
- PostgreSQL code needs live integration evidence once Docker/Postgres is available.
- Neo4j remains a tested adapter/read model concept but was not validated against a live Neo4j service in this pass.
- Backend `server.ts` still needs feature-controller decomposition.
- SPEC05/SPEC06/SPEC07/SPEC08/FICs still need full canonical cleanup.

## Follow-ups

1. Complete P0.3 by moving any remaining useful Rust verification algorithms to Analysis/Finding contracts.
2. Run live PostgreSQL restart persistence validation when Docker or a reachable Postgres is available.
3. Decompose backend HTTP routes into feature controllers and use cases.
4. Add Fixture Lab and deterministic golden tests for the requested scenario set.
