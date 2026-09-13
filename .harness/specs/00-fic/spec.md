# Spec 00 — Feature Impact Contract

## Obrigatório em toda feature

```yaml
feature_id:
title:
owner:
status: proposed|designed|implementing|verified|released
intent:
non_goals:
domain_owner:

approval:
  gate_run_id:
  gate_rule_set_version:
  model_revision:
  approved_by:
  approved_at:
  approval_evidence:

contracts:
  - name:
    version:
    change: none|additive|breaking

data_sources: []
kg:
  nodes_added: []
  nodes_changed: []
  relationships_added: []
simulation:
  states_added: []
  transitions_added: []
  timing_rules_changed: []
gates:
  added: []
  changed: []
  affected: []
gateway:
  capabilities_added: []
  capabilities_changed: []
  tools_added: []
  tools_changed: []
  policy_changed: []
  registry_changed: []
authorization:
  principals_affected: []
  workspace_rules_changed: []
security:
  threats_addressed: []
  invariants_affected: []
audit:
  events_added: []
  events_changed: []
mcp:
  tools_added: []
  resources_added: []
api:
  endpoints_added: []
  endpoints_changed: []
persistence:
  postgres_migrations: []
  neo4j_migrations: []
tests:
  unit: []
  integration: []
  property: []
  fixtures: []
  e2e: []
  gateway: []
observability:
  metrics: []
  traces: []
  logs: []
rollback:
risks:
```

## Classificação de impacto

- `DIRECT`: alterado diretamente.
- `DERIVED`: semanticamente dependente.
- `CONTRACT`: formato/semântica mudou.
- `RUNTIME`: resultado do simulator mudou.
- `GATE`: PASS/FAIL da validação mecânica de harness (implementação) pode mudar.
- `GATEWAY`: authorization/capability/policy/routing mudou.
- `AUDIT`: evento de auditoria mudou.

## Regra crítica

Se gates.affected estiver vazio, declarar explicitamente a razão e evidência.

Se gateway.tools_changed ou gateway.capabilities_changed estiverem vazios para uma feature que altera uma tool MCP, declarar explicitamente a razão.

Nenhuma feature pode mudar de `status` para `released` sem `approval.gate_run_id` preenchido e um veredito de validação de harness `PASS` vinculado a `approval.model_revision` e `approval.gate_rule_set_version` (conforme validado pela skill `validate-feature-mechanics`). Esse controle pertence estritamente à governança de desenvolvimento/harness e não representa autoridade de runtime do produto. Se o `model_revision` do repositório avançar após o `gate_run_id` ter sido emitido, a aprovação é considerada `STALE` e a validação de harness deve ser reexecutada antes do release.

## Checklist

- domínio;
- contrato;
- KG;
- simulator;
- gates;
- gateway;
- authorization;
- capability;
- tool-policy;
- workspace;
- security;
- audit;
- fixtures;
- migrations;
- API/MCP;
- observabilidade;
- rollback.

Silêncio nunca significa "sem impacto".
