# Spec 07 — Observability + Operations

## Status: COMPLETE

## Overview

O SPEC 07 implementa a camada de **observabilidade interna, operacional e de desenvolvimento**, separada da experiência de produto do Combat Designer.

A stack de observabilidade atende aos responsáveis pela operação, desenvolvimento, diagnóstico, segurança e manutenção da plataforma:
- **Metrics**: Métricas operacionais via OpenTelemetry Metrics (`/metrics` para Prometheus scraping).
- **Logs**: Structured JSON logging com redaction automática e recursiva de credenciais e tokens.
- **Traces**: W3C Trace Context propagation nativo via OpenTelemetry SDK/API (`traceparent`, `tracestate`).
- **Health**: Endpoints operacionais sanitizados (`/health/live`, `/health/ready`, `/health/dependencies`).
- **Dashboards**: Grafana provisioning e definições declarativas para API, Gateway, Simulator, Combat Analysis e Infraestrutura.

---

## Separação Arquitetural: Product vs. Operations

A plataforma estabelece uma fronteira não negociável entre Product e Operations:
- **Product UI (`frontend/`)**: Interface exclusiva do jogo/designer. Não contém painéis operacionais de telemetria, não expõe métricas de infraestrutura, e não possui dependências com Prometheus, Grafana, Loki, Tempo ou OTel Collector.
- **Operations Stack (`observability/`, `backend/api`)**: Camada interna protegida por barreira de acesso e isolamento de rede.

---

## Authority & Failure Invariants

1. **Authority**:
   - `Observability observes; it NEVER authorizes, verifies, approves, applies, or mutates canonical state.`
   - Telemetria nunca sintetiza ou altera diagnósticos, findings, evidências ou resultados de simulação.
   - Telemetria nunca autoriza mutações no estado canônico.
2. **Domain Purity**:
   - Crates Rust (`combat-domain`, `combat-simulation`, `combat-verification`) permanecem 100% puros, determinísticos, baseados em inteiros e livres de frameworks de telemetria.
3. **Telemetry Failure Isolation**:
   - Falhas na stack de telemetria são non-fatal (`domain correctness > telemetry delivery`).
   - O domínio e a aplicação continuam produzindo o mesmo resultado determinístico mesmo sob pane total do coletor ou exportadores de telemetria.
4. **Cardinality Protection**:
   - Identificadores individuais (`trace_id`, `span_id`, `request_id`, `correlation_id`, `attack_id`, `changeset_id`, `simulation_id`, `gate_run_id`, `event_id`) são estritamente proibidos como labels de métricas.
5. **Chat Interface Isolation (SPEC 13)**:
   - Dados de observabilidade (`trace_id`, `span_id`, stack traces, SQL, Cypher, internal network addresses) são estritamente isolados da experiência conversacional do usuário no Combat Director.
   - O chat reporta apenas atividades públicas humanizadas (`PublicActivity`) e erros tipados controlados (`PublicChatErrorCode`).


---

## Endpoints Operacionais

- `GET /health/live`: Liveness check (200 `{"status":"LIVE"}`).
- `GET /health/ready`: Readiness check (200 `{"status":"READY"}` ou 503 `{"status":"UNHEALTHY"}`).
- `GET /health/dependencies`: Dependency health sanitizado (Postgres, Neo4j, MCP, API). Protegido por barreira operacional (403 se não autorizado).
- `GET /metrics`: Prometheus exposition format via OpenTelemetry Metrics. Protegido por barreira operacional (403 se não autorizado).

---

## Verificação

- **Suíte Funcional**: `07.T.1` a `07.T.19` (19 testes passando).
- **Suíte de Segurança**: `07.SEC.1` a `07.SEC.16` (16 testes passando).
- **Suíte de Regressão SPEC 00–06**: 100% dos testes anteriores passando sem qualquer regressão.
- **Feature Impact Contract**: `.harness/docs/feature-impacts/spec-07-observability-operations.yaml` validado programaticamente (8/8 runtime FICs).
- **Walkthrough**: `.agents/walkthroughs/spec-07-observability-operations.md`.
