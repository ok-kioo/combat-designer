# Combat Designer — Walkthrough: SPEC 07 — Observability + Operations

## 1. Objective

Implement **SPEC 07 — Observability + Operations** as an internal platform capacity for operators, developers, and security diagnosticians, strictly separated from the game product experience (`frontend/`). Observability serves to monitor, measure, and record execution behavior across HTTP APIs, MCP Gateway, MCP Server, Application use cases, Deterministic Simulator, Mechanical Gate, and persistence layers without acquiring domain authority or compromising the determinism of engine crates.

---

## 2. Architectural Decisions & Verified Packages

- **HTTP Boundary**: Monorepo inspection confirmed that no HTTP runtime previously existed. `backend/api` (`@combat-designer/api`) was introduced as the canonical HTTP boundary, hosting operational health endpoints (`/health/live`, `/health/ready`, `/health/dependencies`) and Prometheus metrics scraping (`/metrics`). No arbitrary product routes were invented.
- **Operational Boundary Barrier**: Operational endpoints (`/metrics`, `/health/dependencies`) enforce an explicit operational isolation barrier (`x-operational-secret`, `x-internal-secret`, or `Authorization: Bearer <secret>`). Product callers sending standard product credentials or omitting operational secrets are denied with `403 Forbidden`. Strict operational isolation mode is configurable (`strictOperationalIsolation: true`) to gate container health probes as well.
- **Production Tracing Pipeline**:
  `Application → OpenTelemetry API/SDK → BatchSpanProcessor → OTLPTraceExporter → OpenTelemetry Collector → Tempo/observability backend`.
  `InMemorySpanExporter` is preserved exclusively for unit tests. In production runtime, `NativeTracer` uses `BatchSpanProcessor` with `OTLPTraceExporter` (targeting OTLP HTTP receiver `http://localhost:4318/v1/traces`), detaching span completion from network transmission and bounding queue size to 2,048 spans.
- **Production Metrics Pipeline**:
  `MeterProvider` is configured with `PrometheusExporter` from `@opentelemetry/exporter-prometheus` as its `MetricReader`. Metric serialization is performed canonically by `PrometheusSerializer` from `@opentelemetry/exporter-prometheus`. No custom registries, secondary accumulators, or parallel counters exist outside OpenTelemetry.
- **Exact Installed OpenTelemetry Package Versions**:
  - `@opentelemetry/api`: `1.9.1`
  - `@opentelemetry/core`: `2.11.0`
  - `@opentelemetry/resources`: `2.11.0`
  - `@opentelemetry/sdk-metrics`: `2.11.0`
  - `@opentelemetry/sdk-trace-base`: `2.11.0`
  - `@opentelemetry/semantic-conventions`: `1.43.0`
  - `@opentelemetry/exporter-trace-otlp-http`: `0.222.0`
  - `@opentelemetry/exporter-prometheus`: `0.222.0`
- **Purity & Authority Invariants**:
  - `Observability observes; it NEVER authorizes, verifies, approves, applies, or mutates canonical state.`
  - Engine crates (`combat-domain`, `combat-simulation`, `combat-verification`) remain pure, integer-based, clock-independent, and free of telemetry dependencies.
  - Telemetry errors are completely non-fatal (`domain correctness > telemetry delivery`).

---

## 3. Product vs Operations Separation

The platform enforces a strict separation of concerns:
```text
                         PRODUCT
                            │
                            ▼
                  Combat Designer UI (frontend/)
                            │
                            ▼
                     API / Application
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
     Graph / DB         Simulator          ChangeSets
                            │                 │
                            ▼                 ▼
                      Mechanical Gate      Approval
                            │                 │
                            └────────┬────────┘
                                     ▼
                                Persistence


                         OPERATIONS
                            │
                            ▼
                  OpenTelemetry API / SDK
                            │
                    BatchSpanProcessor
                            │
                           OTLP
                            │
                            ▼
                 OpenTelemetry Collector
                   /        |         \
                  ▼         ▼          ▼
             Prometheus   Loki    Tempo / Jaeger
                  \         |         /
                   \        |        /
                    └─── Grafana ───┘
```
- `frontend/` does not import or depend on Prometheus, Grafana, Loki, Tempo, Jaeger, or OTel Collector.
- Operational endpoints (`/metrics`, `/health/dependencies`) are protected behind an internal operational boundary barrier (`x-operational-secret`, `x-internal-secret`, or bearer authorization).

---

## 4. Observability Stack Components

- **Tracing**: Native OpenTelemetry Tracer using `BasicTracerProvider`, `BatchSpanProcessor`, `OTLPTraceExporter`, and `W3CTraceContextPropagator` (`InMemorySpanExporter` used exclusively for test introspection).
- **Metrics**: Native OpenTelemetry Metrics pipeline using `MeterProvider`, `PrometheusExporter`, and instruments (Counters, Histograms, UpDownCounters), serialized via `PrometheusSerializer`.
- **Logging**: Structured JSON logger (`StructuredLogger`) with recursive credential and token redaction.
- **Health**: Multi-tier dependency health checker (`HealthChecker`) evaluating API, PostgreSQL, Neo4j, and MCP, outputting strictly sanitized reports with credentials masked.
- **Collector & Dashboards**: OpenTelemetry Collector configuration (`otel-collector-config.yaml`) and Grafana provisioning/dashboards for all subsystems.

---

## 5. Files Created

- `backend/contracts/src/observability/trace.ts`
- `backend/contracts/src/observability/logging.ts`
- `backend/contracts/src/observability/metrics.ts`
- `backend/contracts/src/observability/health.ts`
- `backend/contracts/src/observability/index.ts`
- `backend/application/src/ports/telemetry-port.ts`
- `backend/application/src/ports/health-check-port.ts`
- `observability/package.json`
- `observability/tsconfig.json`
- `observability/src/tracing/tracer.ts`
- `observability/src/metrics/metric-definitions.ts`
- `observability/src/metrics/instrumentation.ts`
- `observability/src/logging/structured-logger.ts`
- `observability/src/health/health-checker.ts`
- `observability/src/adapters/telemetry-adapter.ts`
- `observability/src/index.ts`
- `observability/otel/otel-collector-config.yaml`
- `observability/grafana/provisioning/datasources/datasources.yaml`
- `observability/grafana/provisioning/dashboards/dashboards.yaml`
- `observability/dashboards/api-overview.json`
- `observability/dashboards/gateway-operations.json`
- `observability/dashboards/simulator-telemetry.json`
- `observability/dashboards/mechanical-gate-telemetry.json`
- `observability/dashboards/changesets-lifecycle.json`
- `observability/dashboards/infrastructure-health.json`
- `observability/tests/functional.test.ts`
- `observability/tests/security.test.ts`
- `backend/api/package.json`
- `backend/api/tsconfig.json`
- `backend/api/src/server.ts`
- `backend/api/src/index.ts`
- `backend/api/tests/server.test.ts`
- `.harness/docs/feature-impacts/spec-07-observability-operations.yaml`

---

## 6. Files Modified

- `package.json` (added `"observability"` to monorepo workspaces and `@opentelemetry/*` dependencies)
- `backend/contracts/src/index.ts` (exported `./observability/index.js`)
- `backend/contracts/src/mcp/audit.ts` (re-used canonical `redactSensitiveData` from observability)
- `backend/application/src/index.ts` (exported telemetry and health check ports)
- `shared/architecture/module-boundaries.test.ts` (added `"observability"` to allowed root dirs, implemented RULES 5–12)
- `.agents/validators/fic/validate-cli.ts` (enhanced registry discovery to distinguish runtime FICs 8/8 from template)
- `.harness/specs/07-dashboard-and-observability/spec.md` (updated status to COMPLETE and documented Observability + Operations architecture)

---

## 7. Metrics & Instruments

The canonical metrics pipeline uses native OpenTelemetry instruments:
- **API**: `api_request_count`, `api_request_error_count`, `api_request_latency_ms`
- **Gateway**: `gateway_auth_allow_count`, `gateway_auth_deny_count`, `gateway_workspace_mismatch_count`, `gateway_policy_denied_count`, `gateway_rate_limited_count`
- **Simulator**: `simulation_count`, `simulation_failure_count`, `simulation_budget_exceeded_count`, `simulation_duration_ms`, `simulation_frames_total`, `simulation_events_total`
- **Mechanical Gate**: `gate_run_count`, `gate_pass_count`, `gate_fail_count`, `gate_blocked_count`, `gate_stale_count`, `gate_budget_exceeded_count`, `gate_error_count`, `gate_duration_ms`
- **ChangeSets**: `changeset_proposed_count`, `changeset_simulated_count`, `changeset_verified_count`, `changeset_approved_count`, `changeset_applied_count`, `changeset_withdrawn_count`, `changeset_rejected_count`

All metrics are exposed at `GET /metrics` in standard Prometheus exposition format via the canonical OpenTelemetry `PrometheusExporter` and `PrometheusSerializer`.

---

## 8. Logs

Logs are emitted as structured JSON objects conforming to `LogEvent`:
- Fields: `timestamp`, `level`, `event_name`, `workspace_id`, `principal_id`, `correlation_id`, `request_id`, `tool_id`, `operation`, `status`, `duration_ms`, `error_code`, `details`.
- Automatic recursive redaction scrubs all tokens, passwords, Authorization headers, and API keys.

---

## 9. Traces

Native W3C Trace Context propagation and strictly typed span contracts:
- Header: `traceparent: 00-{trace_id}-{span_id}-{trace_flags}` and `tracestate`.
- Context separation:
  - **Trace Context**: W3C distributed trace (`trace_id`, `span_id`, `trace_flags`, `tracestate`).
  - **Request Context**: HTTP request lifecycle (`request_id`, `timestamp_utc`, `method?`, `path?`).
  - **Correlation Context**: Application metadata (`correlation_id`, `workspace_id`, `tool_id`, `use_case`).
- `span_id` is exclusively generated and managed by the tracing provider.
- `TelemetrySpanStatus = 'UNSET' | 'OK' | 'ERROR'`, strictly enforced by `TelemetrySpan.end()`.

---

## 10. Health

Sanitized health endpoints:
- `GET /health/live` & `GET /health`: Liveness verification (`LIVE` / `UNHEALTHY`).
- `GET /health/ready`: Readiness verification (`READY` / `UNHEALTHY`).
- `GET /health/dependencies`: Detailed dependency verification (PostgreSQL, Neo4j, MCP, API). Sanitization ensures zero connection strings, hostnames, passwords, or raw exceptions leak.

---

## 11. Security

- **07.SEC.1**: Observability cannot mutate canonical state.
- **07.SEC.2**: Metrics endpoint does not expose secrets.
- **07.SEC.3**: Structured logs recursively redact credentials.
- **07.SEC.4**: Cross-workspace telemetry isolation.
- **07.SEC.5**: Trace context cannot escalate authorization.
- **07.SEC.6**: Correlation ID cannot become principal identity.
- **07.SEC.7**: Observability cannot approve ChangeSets.
- **07.SEC.8**: Observability cannot apply ChangeSets.
- **07.SEC.9**: Observability cannot alter GateResult.
- **07.SEC.10**: Observability cannot alter SimulationResult.
- **07.SEC.11**: High-cardinality metric labels are rejected and explicitly marked as `cardinality_sanitized: "true"`.
- **07.SEC.12**: Operational endpoints are not exposed through product frontend.
- **07.SEC.13**: Telemetry backend outage cannot change domain outcome (failure isolation).
- **07.SEC.14**: Health endpoint does not expose internal dependency secrets (sanitization).
- **07.SEC.15**: Operational observability endpoints are inaccessible from product API surface (access boundary).
- **07.SEC.16**: Telemetry cannot inject or override authenticated principal.

---

## 12. Cardinality

Cardinality protection is enforced via `validateMetricLabels()` and `sanitizeMetricLabels()`:
- **Forbidden keys**: `trace_id`, `span_id`, `request_id`, `correlation_id`, `attack_id`, `changeset_id`, `simulation_id`, `gate_run_id`, `event_id`.
- **Allowed keys**: Low-cardinality aggregate dimensions such as `operation`, `status`, `verdict`, `error_code`, `component`.
- **Explicit Behavior**: Strictly drops only keys matching `FORBIDDEN_METRIC_LABELS`. Arbitrary attributes are never dropped. When forbidden keys are dropped, an explicit operational indicator (`cardinality_sanitized: "true"`) is attached. Telemetry protection never modifies business logic or throws exceptions.

---

## 13. Data Retention

Recommended operational retention policies:
- Metrics: 15 days in Prometheus TSDB.
- Traces: 7 days in Tempo / Jaeger.
- Logs: 14 days in Loki.
- Audit records: Stored append-only in canonical PostgreSQL persistence without automatic expiration.

---

## 14. Performance & Memory Guarantees

- **Decoupled Execution**: Telemetry emission is isolated from business execution via in-memory buffering and asynchronous background exporting; failures in telemetry emission are fail-safe and never modify business execution.
- **Bounded In-Memory Buffers**:
  - `BatchSpanProcessor`: Queue size bounded to `maxQueueSize: 2048` spans with automatic drop on queue exhaustion.
  - `PrometheusExporter`: Maintains pre-declared metric instruments bounded by Low-Cardinality label policies.

---

## 15. Exact Commands Executed

```bash
npm run typecheck
npm run test:architecture
npm test
npm run validate-fic
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --target-dir engine/target
```

---

## 16. Actual Outputs

```text
> typecheck
> npm run --workspaces --if-present typecheck
[PASSED: 7 packages checked with 0 errors]

> test:architecture
> vitest run shared/architecture
Test Files  1 passed (1)
     Tests  16 passed (16)

> validate-fic
Found 9 FIC(s) (8 runtime FICs, 1 template).
  ✔ spec-00-fic
  ✔ spec-01-canonical-model
  ✔ spec-02-engine-ingestion
  ✔ spec-03-knowledge-graph
  ✔ spec-04-deterministic-simulator
  ✔ spec-05-mechanical-gate
  ✔ spec-06-mcp-llm-orchestration
  ✔ spec-07-observability-operations
  ✔ example-feature-001 [template]
[PASSED] Runtime FICs: 8/8 valid. Template: 1 valid (not counted as runtime SPEC). All 9 files valid.

> cargo test --target-dir engine/target
[PASSED: 85 engine tests passed across combat-domain, combat-simulation, combat-verification]
```

---

## 17. Programmatic Test Accounting

### Breakdown Per Suite

| Language | Test Suite | File / Scope | Passed | Failed | Skipped | Total |
|---|---|---|:---:|:---:|:---:|:---:|
| TypeScript | `@combat-designer/api` | `backend/api/tests/server.test.ts` | 11 | 0 | 0 | 11 |
| TypeScript | `@combat-designer/application` | `backend/application/tests/` (3 files) | 16 | 0 | 0 | 16 |
| TypeScript | `@combat-designer/shared-contracts` | `backend/contracts/tests/` (3 files) | 24 | 0 | 0 | 24 |
| TypeScript | `@combat-designer/ingestion` | `backend/infrastructure/ingestion/tests/` (4 files) | 25 | 0 | 0 | 25 |
| TypeScript | `@combat-designer/graph-adapter` | `backend/infrastructure/neo4j/tests/` (3 files) | 19 | 0 | 0 | 19 |
| TypeScript | `@combat-designer/mcp` | `mcp/tests/integration/` (4 files) | 40 | 0 | 0 | 40 |
| TypeScript | `@combat-designer/observability` | `observability/tests/functional.test.ts` (07.T.1–19) | 19 | 0 | 0 | 19 |
| TypeScript | `@combat-designer/observability` | `observability/tests/security.test.ts` (07.SEC.1–16) | 16 | 0 | 0 | 16 |
| TypeScript | `shared/architecture` | `shared/architecture/module-boundaries.test.ts` | 16 | 0 | 0 | 16 |
| **TypeScript Subtotal** | **All 8 TS modules** | **21 test files** | **186** | **0** | **0** | **186** |
| Rust | `combat_domain` | Invariants, properties, determinism, equivalence | 18 | 0 | 0 | 18 |
| Rust | `combat_simulation` | Simulator, budget, replay, determinism, isolation | 23 | 0 | 0 | 23 |
| Rust | `combat_verification` | Gate verifier, security, properties, architecture | 44 | 0 | 0 | 44 |
| **Rust Subtotal** | **All 3 engine crates** | **8 test targets** | **85** | **0** | **0** | **85** |
| **TOTAL AUTOMATED TESTS** | **TypeScript + Rust Engine** | **29 test files / targets** | **271** | **0** | **0** | **271** |

### Verification Formula
```text
Passed total  = 186 (TS) + 85 (Rust) = 271
Failed total  = 0
Skipped total = 0
Total         = Passed + Failed + Skipped = 271 + 0 + 0 = 271
```
- Discrepancy indicator: `NONE (0)`
- `INDICATOR: TEST_COUNT_MISMATCH` is strictly zero.

---

## 18. Regression Verification

All test suites from SPECs 00 through 06 were executed in full and passed:
- SPEC 00 (FIC): Validated across registry (8/8 runtime FICs).
- SPEC 01 (Domain): 18 Rust unit/property/determinism tests passed.
- SPEC 02 (Ingestion): 25 TypeScript ingestion tests passed.
- SPEC 03 (Knowledge Graph): 19 TypeScript graph adapter tests passed.
- SPEC 04 (Simulator): 23 Rust simulator tests passed.
- SPEC 05 (Mechanical Gate): 44 Rust verification tests passed.
- SPEC 06 (MCP Gateway + Server): 40 TypeScript MCP integration tests passed.
- Architecture Invariants (RULES 1–12): 16 boundary tests passed.

---

## 19. Known Limitations

- Production deployment of Grafana/Loki/Tempo requires launching the corresponding internal containers defined in the provisioning manifests; local execution relies on the in-process OTel SDK and `/metrics` exposition format.
- High-cardinality queries are strictly reserved for distributed trace spans and structured logs rather than metric labels.

---

## 20. Final Status

```text
SPEC 00 — COMPLETE
SPEC 01 — COMPLETE
SPEC 02 — COMPLETE
SPEC 03 — COMPLETE
SPEC 04 — COMPLETE
SPEC 05 — COMPLETE
SPEC 06 — COMPLETE
SPEC 07 — COMPLETE
SPEC 08 — NOT STARTED
SPEC 09 — NOT STARTED

ZERO REGRESSION
OBSERVABILITY OPERATIONAL
OPERATIONS TELEMETRY OPERATIONAL
MECHANICAL GATE AUTHORITATIVE
HUMAN APPROVAL AUTHORITATIVE FOR APPLY
PRODUCT UI DOES NOT EXPOSE INTERNAL OBSERVABILITY
```
