# Spec 07 — Dashboard and Observability

## Layout

Duas colunas, ambas escopadas ao `workspace_id` ativo (specs/08, specs/09): painel do
projeto à esquerda (upload de Export Bundle, status de ingestão, revision/snapshot atual,
histórico de gates/simulações) e o Diretor de Combate (chat MCP/LLM) à direita. O painel
esquerdo nunca escreve diretamente em canonical data — upload dispara o pipeline de specs/02.

Toda interação do Diretor de Combate passa pelo MCP Gateway antes de alcançar o MCP Server
e o Application Layer (specs/06, docs/architecture/mcp-gateway.md).

## Telas MVP

### Combat Explorer

Timeline, startup, active, recovery, hitstun, hitstop, custos e cancels.

### Graph Explorer

Ataque -> cancel -> ataque; ataque -> reação; ataque -> recurso.

### Simulation

Frame, state, hitbox, events, resources e combo count.

### Gate Report

PASS/FAIL/BLOCKED/STALE/BUDGET_EXCEEDED, regra, threshold, observado, evidência, simulation hash e sugestões. Um resultado `STALE` é exibido de forma visualmente distinta de `FAIL`, com o `model_revision`/`rule_set_version` original e um atalho para reexecutar o gate. `BUDGET_EXCEEDED` é exibido de forma distinta, indicando que o espaço de busca excedeu o orçamento.

## Métricas

### Application / Domain

```text
ingestion_duration
ingestion_assets_total
ingestion_assets_quarantined
simulation_duration
simulation_frames
gate_duration
gate_failures
gate_stale_results
llm_proposals
changesets_blocked
changesets_withdrawn
```

### MCP Gateway

```text
mcp_gateway_requests_total
mcp_gateway_denials_total
mcp_gateway_authorization_failures
mcp_gateway_workspace_denials
mcp_gateway_capability_denials
mcp_gateway_policy_denials
mcp_gateway_latency
mcp_gateway_tool_calls
mcp_gateway_apply_attempts
mcp_gateway_apply_denials
```

### MCP Server

```text
mcp_tool_calls
mcp_tool_errors
mcp_tool_latency
```

## Traces

```text
mcp.request
  -> gateway.authorize
    -> mcp_server.tool
      -> application.propose
        -> graph.query
        -> simulation.run
        -> gate.run
```

## Correlation IDs

```text
trace_id
principal_id
workspace_id
request_id
revision_id
changeset_id
scenario_id
gate_run_id
```

## Audit Events

Eventos de auditoria emitidos pelo Gateway e pelo Application, contendo quando aplicável:

```text
trace_id
principal_id
principal_type
workspace_id
tool_id
capability
request_id
revision_id
changeset_id
gate_run_id
decision (ALLOW | DENY)
reason
timestamp
```

O `timestamp` pode existir na camada de infraestrutura/auditoria. Ele **não** deve entrar no cálculo determinístico do simulador — o simulador opera em frames inteiros sem relógio de sistema.

## Regra

UI nunca altera diretamente canonical data ou simulator state.

UI não acessa banco diretamente — toda operação passa pelo API, que por sua vez opera sob as mesmas regras de autorização e validação do Application Layer.

## Aceite

Designer consegue seguir pergunta -> proposta -> simulação -> gate -> evidência sem acessar infraestrutura.

O dashboard exibe métricas do Gateway (denials, authorization failures, workspace denials) de forma acessível para auditoria.
