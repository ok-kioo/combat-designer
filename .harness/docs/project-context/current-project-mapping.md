# Current Project Mapping — Bindings for Reusable Rules and Skills

> This file is intentionally project-specific. Reusable rules and skills must not copy these concrete paths/names back into their generic bodies.

## 1. Harness bindings

| Binding | Current value |
|---|---|
| `SPEC_ROOT` | `.harness/specs/` |
| `RULE_ROOT` | `.harness/rules/` |
| `SKILL_ROOT` | `.harness/skills/` |
| `LESSON_ROOT` | `.harness/lessons/` |
| `FIC_ROOT` | `.harness/docs/feature-impacts/` |
| `ARCH_DOC_ROOT` | `.harness/docs/architecture/` |
| `AGENT_ROOT` | `.agents/` |

A generated concrete-reference index is available at `.harness/docs/project-context/spec-implementation-index.md`.

## 2. Runtime roots and responsibilities

- `backend/`: TypeScript application/API, application use cases, persistence orchestration, authorization integration, chat orchestration.
- `engine/`: Rust deterministic domain/simulation/analysis implementation.
- `frontend/`: product UI/workbench.
- `mcp/`: MCP Gateway/Server and typed tool exposure for the Combat Director.
- `shared/`: architecture/boundary validation and shared repository-level checks.

Runtime code must not import `.harness/` or `.agents/`.

## 3. Current architectural decisions that reusable artifacts must preserve

- PostgreSQL is canonical persistence.
- Neo4j is a projection/read model, never canonical persistence.
- Rust is the mechanical/deterministic computation authority.
- TypeScript owns application/API/MCP orchestration.
- Gameplay/mechanical time is integer frame/tick based; deterministic computation must not use wall-clock time.
- Critical imported/canonical fields retain provenance.
- Project-specific resources are scoped by `workspace_id`.
- Authentication uses JWT identity; authorization resolves ownership/permissions in the Application layer. Client-supplied `workspace_id` is context, not proof of access.
- The LLM/Combat Director interprets intent, invokes authorized tools, explains findings, and recommends. It is not a mechanical or authorization authority.
- The product is analysis-only with respect to the external game project. It does not directly apply Combat Director recommendations to Unity/project source.
- The historical runtime Mechanical Gate / `GateResult` / `GateVerdict` / ChangeSet approve/apply direction is not canonical product architecture. Runtime uses Simulation + Combat Analysis + Findings/Evidence + Recommendation. PASS/FAIL mechanics belong only to development-governance validation.
- Runtime Combat Analysis is optional and consumes `SimulationResult`; it produces findings/diagnostics, not approval verdicts.
- MCP exposes consultative/search/simulation/analysis capabilities; Gate/apply tools are not canonical product tools.
- Observability never authorizes, validates domain truth, or mutates product state; internal DB/graph/snapshot health is not user-facing product UX.
- `.harness` contains project-specific specs plus reusable rules/skills/lessons. `.agents` is operational governance only. Runtime depends on neither.

## 4. Current project-specific specifications of special importance

- Canonical domain: `.harness/specs/01-canonical-domain/spec.md`
- Ingestion: `.harness/specs/02-engine-ingestion/spec.md`
- Knowledge graph/read model: `.harness/specs/03-knowledge-graph/spec.md`
- Deterministic simulation: `.harness/specs/04-deterministic-simulator/spec.md`
- Combat analysis/diagnostics: `.harness/specs/05-combat-analysis-and-diagnostics/spec.md`
- MCP + LLM orchestration: `.harness/specs/06-mcp-llm-orchestration/spec.md`
- Authentication/ownership: `.harness/specs/12-authentication/`
- Combat Director: `.harness/specs/13-combat-director-chat/`
- Product UX/characters/combos: `.harness/specs/14-product-ux-and-combat-workbench/spec.md`

## 5. Current runtime analysis mapping

- Rust analysis module target: `engine/src/analysis/`.
- Backend analysis types: `backend/src/modules/combat/domain/entity/analysis.types.ts`.
- Backend analysis port: `backend/src/modules/combat/domain/repository/combat-analysis-port.ts`.
- Backend analysis use case: `backend/src/modules/combat/service/analyze-combat.ts`.
- Canonical runtime terminology: `AnalysisResult`, `Finding`, `Diagnostic`, `Evidence`.
- Development-only acceptance terminology: `PASS`, `FAIL`, `BLOCKED` for code/spec validation.

## 6. Current MCP/product direction

Canonical runtime tool surface is consultative. Current specs include tools such as:

- `combat_search`
- `combat_get_attack`
- `combat_simulate`
- `combat_analyze`
- `combat_find_combos`
- `impact_analysis`
- `list_scenarios`

Legacy Gate/apply tool names must not be reintroduced as canonical product tools.

## 7. Current product domain additions

- `Character` is a first-class project-scoped entity.
- Attack ownership is explicit; unresolved ownership is represented as an unassigned state, not a fake Character entity.
- Knowledge graph queries and combo search are character-aware.
- Combos are character-scoped; cross-character sequences are rejected unless an explicit game mechanic supports them.
- Derived combo evaluation metrics carry revision/simulation provenance rather than masquerading as timeless canonical facts.
- Conversations/messages are persisted and isolated by user + workspace + conversation.
- Product UI uses user-facing language (`Simulação de Combate`, `Análises`, `Findings`, `Recomendações`) rather than infrastructure/governance terminology.

## 8. Project validation commands

Use repository scripts when present. Current expected validation set includes:

```text
npm run validate-fic
npm run typecheck
npm run test:architecture
npm --prefix backend test
npm --prefix mcp test
npm --prefix frontend test
cargo fmt --check --manifest-path engine/Cargo.toml
cargo clippy --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target -- -D warnings
cargo test --manifest-path engine/Cargo.toml --workspace --offline --target-dir engine/target
```

Do not globally modify Cargo environment to redirect build output. Keep Rust target output under `engine/target` for these verification commands.

## 9. Artifact semantics

- Project specs are intentionally project-specific and may contain concrete paths, modules, technologies, endpoints, and entity names.
- Rules are reusable hard invariants and must not depend on this mapping to define their principle.
- Skills are reusable procedures; bindings supply project-specific locations/commands.
- Lessons are reusable explanations of recurring failure patterns.
- FICs are project-specific impact/traceability artifacts.
- Walkthroughs/reports are evidence of a specific implementation/execution.

## 10. Conflict handling

If this mapping conflicts with a newer project spec or explicit user decision, the newer authoritative decision wins and this mapping must be updated in the same change. The reusable rule/skill must not be modified merely to encode the project-specific exception.
