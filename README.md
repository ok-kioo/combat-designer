# Combat Designer

Combat Designer is a workbench for action-combat designers. It organizes combat data by authenticated user and workspace, imports engine data, exposes deterministic simulation and analysis, and helps the Combat Director produce recommendations and non-mutating proposals.

The current product architecture is:

```text
User
  -> JWT authentication
  -> Workspace ownership
  -> Canonical combat domain
  -> PostgreSQL persistence when DATABASE_URL is configured
  -> Neo4j knowledge graph projection when configured
  -> Deterministic simulation
  -> Combat analysis and findings
  -> Combat Director recommendation / proposal
```

The development harness is separate:

```text
Specs
  -> Rules
  -> Skills
  -> Implementation
  -> Tests and architecture validation
  -> PASS / FAIL for implementation evidence
```

Product runtime must not treat development verdicts as user-facing combat states. Simulation answers what happens. Analysis produces findings and evidence. The Combat Director explains, recommends, and can draft proposals; it does not directly mutate an engine project.

## Main Modules

- `frontend/`: React 19 product UI with React Router DOM 7. Routes are URL-owned, authenticated workspace pages are nested under `/workspaces/:workspaceId`, and the backend no longer serves a duplicate product HTML workbench.
- `backend/`: HTTP API, auth, workspace authorization, ingestion, combat query/simulation/analysis orchestration, chat, proposals, observability, and infrastructure adapters.
- `engine/`: Rust deterministic combat domain, simulation, and historical verification/diagnostic algorithms.
- `mcp/`: typed MCP gateway/server surface for consultative Combat Director capabilities.
- `.harness/`: project specs, reusable rules, skills, lessons, feature-impact records, and architecture documentation.

## Local Development

Install dependencies:

```bash
npm install
```

Run the frontend build:

```bash
npm --prefix frontend run build
```

Run the backend:

```bash
npm --prefix backend run dev
```

For production-like persistence, provide `DATABASE_URL`. Without it, tests and local isolated runs can still inject in-memory repositories explicitly.

## Validation

Useful validation commands:

```bash
npm run typecheck
npm --prefix backend test
npm --prefix frontend test
npm --prefix mcp test
npm run test:architecture
npm run validate-fic
PLAYWRIGHT_BROWSERS_PATH=/tmp/combat-playwright npm --prefix frontend run test:e2e
cargo fmt --check --manifest-path engine/Cargo.toml
cargo clippy --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target -- -D warnings
cargo test --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target
```

Some backend integration tests open local HTTP listeners. In restricted sandboxes they can fail with `listen EPERM`; run them with host/network permission in that environment.
