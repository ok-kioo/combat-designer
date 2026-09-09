# Spec 09 — Ingestion Security and Execution Limits

Origem: `regras/propostas/2026-09-09-web-platform-and-security.md`, itens 3, 4, 5, 6, 7
(ACCEPTED / ACCEPTED-adaptado). Este spec complementa, e não substitui, as defesas já
existentes em specs/02 (QUARANTINED por asset) e specs/06 (`untrusted_text`, proibição de
`propose_changeset` baseado só em texto não confiável).

## 1. Limites de upload (DoS / JSON bomb)

- Tamanho máximo por asset individual e por bundle comprimido (configurável por deployment;
  default sugerido: 5MB/asset, 10MB/bundle).
- O parser de envelope deve abortar por profundidade de aninhamento e por tamanho **antes**
  de materializar a árvore inteira em memória (parsing incremental/streaming), não depois.
- Upload acima do limite: rejeitado no envelope, nunca truncado ou processado parcialmente
  em silêncio.

## 2. Validação em duas camadas

### Camada 1 — Envelope (rejeita o bundle inteiro)

`manifest.json` (specs/08) validado contra schema estrito antes de qualquer parser de asset
rodar. Falha aqui é `REJECTED` com path do campo e motivo — nunca um upload "parcialmente
aceito" sem manifest válido, porque sem manifest não há como isolar assets de forma segura.

### Camada 2 — Asset (comportamento já existente em specs/02, reforçado aqui)

Um asset individual malformado dentro de um manifest válido segue a regra já definida em
specs/02: `QUARANTINED`, nunca default silencioso, nunca omitido do relatório. Este spec não
altera esse comportamento — a validação de envelope é uma camada anterior e independente,
não uma substituição.

## 3. Sanitização de campos textuais na ingestão (defesa em profundidade)

Além da defesa arquitetural já existente em specs/06 (texto de asset é `untrusted_text` e
nunca decide um `propose_changeset` sozinho), a ingestão aplica uma camada extra e
independente:

- `name` de Attack/Hitbox/CancelRule/etc. é normalizado contra um charset restrito
  (Unicode categoria letra, dígitos, espaço, underscore, hífen) no momento do parse.
- A string original, não normalizada, é preservada separadamente como `raw_label` com
  `untrusted_text: true` (specs/06), disponível para exibição na UI mas nunca usada em
  lógica de matching, prompt de sistema sem delimitação, ou decisão de gate.
- Esta camada é defesa em profundidade — não substitui a regra de specs/06 de que o LLM
  trata todo texto de asset como dado a analisar, nunca como instrução.

## 4. Isolamento de workspace/tenant

- `workspace_id` obrigatório (specs/08) em toda tabela Postgres, toda propriedade indexada
  em nó Neo4j projetado, e toda chamada de tool MCP.
- Uma query Cypher ou SQL sem `workspace_id` explícito é erro de contrato — rejeitada em
  tempo de desenvolvimento/CI, não uma "query global" por omissão de filtro.
- `auth scope` citado em specs/06 para novas tools MCP inclui, no mínimo, `workspace_id`.

### Teste de aceite obrigatório

Query ou tool call com `workspace_id=A` nunca retorna nó/linha de `workspace_id=B`, mesmo
quando há colisão de `asset_id`/`attack_id` local entre os dois workspaces (ver specs/01,
qualificação de id por engine+projeto — aqui estendida para exigir também isolamento por
workspace, que é uma dimensão ortogonal ao qualificador de id).

## 5. Orçamento de execução (timeout/fuel) para simulação e busca

Amendment a specs/04 e specs/05.

### specs/04 — input adicional

```text
CombatModel
Scenario
InitialState
Seed
TickRate
MaxFrames
ExecutionBudget:
  wall_clock_timeout_ms
  max_iterations   ("fuel", para combo discovery / busca de parâmetros)
```

Estouro de `ExecutionBudget` interrompe a execução e retorna, em vez de `SimulationTrace`
completo, um resultado `BUDGET_EXCEEDED` contendo o que foi explorado até o corte (parcial,
rotulado como tal) e a razão (`timeout` ou `fuel_exhausted`).

### specs/05 — novo resultado não-PASS

`BUDGET_EXCEEDED` é adicionado aos Estados possíveis de `run_gate`/busca, distinto de
`ERROR`: `ERROR` significa falha inesperada (bug); `BUDGET_EXCEEDED` significa espaço de
busca maior que o orçamento configurado, uma condição esperada e tratável. Nenhum dos dois é
PASS.

O MCP (specs/06) deve devolver `BUDGET_EXCEEDED` ao LLM como um resultado explicável ("o
espaço de busca é muito amplo, refine as restrições"), nunca reinterpretado como PASS,
FAIL ou omitido da resposta ao designer.

## 6. Enforcement em camadas

Limites de execução e segurança são aplicados em camadas independentes. Não misturar
security timeout com gameplay frame clock:

```text
MCP Gateway
   │  rate limits, request size limits, tool execution timeout
   │  (security/infra concern, independent of gameplay)
   ↓
Application Layer
   │  business validation, changeset size limits, query complexity limits
   │  (application concern)
   ↓
Simulator
   │  ExecutionBudget (wall_clock_timeout_ms, max_iterations)
   │  (deterministic execution concern — frame clock is integer, no system clock)
   ↓
Mechanical Gate
   │  gate profile limits (fast/strict/research)
   │  (verification concern)
```

O Gateway impõe limites de **request/tool execution** (segurança de fronteira).
O Simulator impõe limites de **execução determinística** (specs/04).
O Gate impõe limites de **verificação** (specs/05).

Esses são independentes: o Gateway pode cortar um request por timeout de segurança sem
que isso signifique que o Simulator atingiu `BUDGET_EXCEEDED`, e vice-versa.

O timestamp do Gateway (para audit, rate limiting, etc.) **não** deve entrar no cálculo
determinístico do simulador. O simulador opera em frames inteiros sem relógio de sistema.

## Feature Impact Contract

```yaml
feature_id: ingestion-security-001
title: Upload limits, envelope validation, name sanitization, workspace isolation, execution budget
status: designed
domain_owner: ingestion
contracts:
  - name: export-bundle-manifest
    version: v1
    change: additive
  - name: simulation-request
    version: v2
    change: additive   # ExecutionBudget
  - name: gate-result
    version: v2
    change: additive   # BUDGET_EXCEEDED
kg:
  nodes_changed: [Attack, Hitbox, CancelRule]   # raw_label/untrusted_text
simulation:
  states_added: [BUDGET_EXCEEDED]
  timing_rules_changed: []
gates:
  added: [EXECUTION_BUDGET]
  affected: [NO_INFINITE_LOOP, MAX_SUSTAINED_DPS]  # buscas que dependem de espaço exaustivo
mcp:
  tools_added: []
persistence:
  postgres_migrations: [workspace_id em todas as tabelas de specs/08]
  neo4j_migrations: [workspace_id indexado em nós projetados]
tests:
  unit: [envelope schema inválido, asset name com tentativa de instrução, bundle acima do limite]
  integration: [isolamento de workspace com id colidente, busca cortada por fuel]
  fixtures: [bundle aninhado excessivo, manifest sem checksum]
observability:
  metrics: [ingestion_bundle_rejected_total, simulation_budget_exceeded_total]
rollback: reverter EXECUTION_BUDGET exige recalcular baseline de gates que hoje rodam sem limite explícito
risks: workspace_id retroativo em dado já existente é a mudança de maior risco deste conjunto
```
