# MCP Gateway — Architecture Document

## 1. Responsabilidade

O MCP Gateway é a **única fronteira de entrada MCP** para operações do Combat Designer.

Ele existe para garantir que nenhum agente, LLM ou cliente MCP possa:

- acessar diretamente banco (Postgres/Neo4j);
- acessar diretamente filesystem de projeto;
- acessar diretamente o simulator;
- alterar canonical state;
- aplicar ChangeSets sem autorização explícita;
- bypassar o Mechanical Gate;
- acessar workspaces não autorizados;
- invocar tools desconhecidas ou não autorizadas;
- executar operações administrativas sem capability explícita.

O Gateway **não é** o juiz de balanceamento. Ele não decide se um combo é seguro.

Cada camada responde uma pergunta diferente:

```text
Gateway:         "CAN I?"         — Este principal pode executar esta operação?
Application:     "IS VALID?"      — Este request é estruturalmente válido?
Simulator:       "WHAT HAPPENS?"  — Qual é o resultado mecânico?
Mechanical Gate: "IS SAFE?"       — As propriedades mecânicas foram satisfeitas?
Human:           "SHOULD WE?"     — O resultado é aceitável para o produto?
```

Nenhum desses passos pode ser eliminado pelo LLM.

---

## 2. Trust Boundary

```text
UNTRUSTED
    │
    ▼
LLM / Agent / MCP Client
    │
   MCP protocol
    │
    ▼
┌──────────────────────────┐
│       MCP Gateway        │  ← primeira fronteira de confiança
└──────────┬───────────────┘
           │
           ▼
TRUSTED APPLICATION DOMAIN
    │
    ├── Application Layer
    ├── Domain (Rust)
    ├── Simulator (Rust)
    ├── Mechanical Gate (Rust)
    ├── Knowledge Graph (Neo4j)
    └── Persistence (Postgres)
```

O LLM é tratado como **untrusted caller**. Isso não significa que a LLM é maliciosa. Significa que:

> Nenhuma decisão de segurança ou integridade pode depender da obediência da LLM às instruções do sistema.

Portanto:

```text
Prompt  ≠  Authorization
LLM response  ≠  Mechanical validation
```

---

## 3. Threat Model

O Gateway deve proteger contra, no mínimo:

### TM-01 — Prompt injection via asset names

Texto de asset (nomes, comentários, strings de AnimNotify, tags) pode conter instruções adversariais. Defesa em profundidade: sanitização na ingestão (specs/09 §3), `untrusted_text: true` no MCP (specs/06), e o Gateway nunca executa comandos derivados exclusivamente de texto não confiável.

### TM-02 — Tool confusion

Um LLM pode ser induzido a invocar tools fora de contexto ou com parâmetros manipulados. O Gateway valida tool_id contra o Tool Registry e rejeita tools desconhecidas.

### TM-03 — Unauthorized tool invocation

Um principal sem a capability necessária tenta invocar uma tool. Deny-by-default: capability ausente → DENY.

### TM-04 — Workspace spoofing

Um principal envia `workspace_id` de outro workspace. O Gateway valida `workspace_id` contra o conjunto de workspaces autorizados para o principal autenticado.

### TM-05 — Cross-workspace access

Uma query ou tool call retorna dados de um workspace diferente. Enforcement em todas as camadas: Gateway, Application, Postgres (row-level), Neo4j (property filter).

### TM-06 — Privilege escalation

Um LLM tenta obter capabilities administrativas (ex.: `admin:policy`, `changeset:apply`). O Gateway aplica o capability model e a policy default. Capabilities nunca são concedidas implicitamente.

### TM-07 — Forged GateResult

Um LLM fabrica ou altera um GateResult para obter PASS. O Gateway e o Application validam GateResult contra simulation_hash, model_revision e rule_set_version armazenados. O LLM nunca pode alterar o resultado do Mechanical Gate.

### TM-08 — Direct mutation attempts

Um LLM tenta escrever diretamente em Postgres, Neo4j ou canonical state. Nenhum MCP tool possui acesso direto a persistence write. Todas as mutações passam pelo Application Layer.

### TM-09 — Replay de requests

Um request MCP previamente válido é reenviado. Mitigação: correlation IDs, idempotency checks no Application, e GateResult vinculado a (model_revision, rule_set_version) — PASS de revisão anterior é STALE.

### TM-10 — Abuso de execution budget

Um caller submete simulações ou buscas deliberadamente amplas para consumir recursos. O Gateway impõe rate limits e tamanho máximo de request. O Simulator impõe ExecutionBudget (specs/04, specs/09). São camadas independentes.

### TM-11 — Requests excessivamente grandes

Payloads oversized consumindo memória/CPU. O Gateway impõe limites de tamanho de request antes de processamento.

### TM-12 — Traversal / recursive tool abuse

Chamadas recursivas ou encadeadas que amplificam custo. O Gateway impõe limites de profundidade e de chamadas por janela de tempo.

### TM-13 — Acesso a ferramentas administrativas

Um LLM tenta invocar ferramentas de administração de workspace, policy ou configuração. Capability `admin:*` é DENY por default para LLMs.

### TM-14 — Bypass do Mechanical Gate

Um LLM tenta aplicar um ChangeSet sem GateResult válido, com GateResult FAIL, STALE, BLOCKED, BUDGET_EXCEEDED ou ERROR. O Application Layer exige GateResult PASS válido para o par exato (model_revision, rule_set_version) antes de aplicar. O Gateway exige capability `changeset:apply` que é DENY por default para LLMs.

---

## 4. Fail Closed

O Gateway opera em modo fail-closed. Qualquer condição de incerteza resulta em DENY:

```text
unknown principal            → DENY
unknown capability           → DENY
unknown workspace            → DENY
workspace mismatch           → DENY
unknown tool                 → DENY
invalid request              → DENY
policy unavailable           → DENY
authorization timeout        → DENY
gate state unverifiable      → DENY
missing workspace_id         → DENY
```

Nunca transformar falha de autorização em comportamento permissivo. Nunca fazer fallback silencioso de DENY para ALLOW.

---

## 5. Principal Model

```text
Principal
    │
    ├── principal_id        (identificador único)
    ├── principal_type      (human | llm | service | system)
    ├── capabilities[]      (lista de capabilities concedidas)
    └── authorized_workspaces[]
```

### Tipos de principal

| Tipo | Descrição |
|---|---|
| `human` | Designer/desenvolvedor autenticado |
| `llm` | Agente LLM (Director de Combate) |
| `service` | Serviço interno (ingestion pipeline, graph projector, etc.) |
| `system` | Operações de sistema (migrations, CI, etc.) |

---

## 6. Capability Model

Capabilities mínimas do sistema:

```text
combat:read           — consultar combat model, KG, provenance
combat:query          — executar queries estruturadas no KG
combat:simulate       — executar simulações (READ_SIMULATION)
combat:propose        — criar ChangeSets (PROPOSAL, não persiste)
combat:verify         — executar Mechanical Gate
changeset:withdraw    — fechar changeset sem aplicar
changeset:apply       — aplicar changeset ao estado canônico (WRITE)
admin:workspace       — gerenciar workspaces
admin:policy          — gerenciar policies de autorização
```

### LLM Default Policy

```text
combat:read           ALLOW
combat:query          ALLOW
combat:simulate       ALLOW
combat:propose        ALLOW
combat:verify         ALLOW
changeset:withdraw    ALLOW
changeset:apply       DENY
admin:*               DENY
```

Se futuramente `changeset:apply` for concedida a um agente LLM, deverá existir:

1. capability explícita concedida ao principal;
2. autorização específica por workspace;
3. policy documentada e auditável;
4. auditoria de toda aplicação;
5. confirmação humana ou mecanismo equivalente definido pelo Application Layer;
6. Mechanical Gate válido (não STALE, não FAIL, não BUDGET_EXCEEDED, não ERROR, não BLOCKED).

O LLM nunca pode obter `changeset:apply` implicitamente.

---

## 7. Workspace Isolation

A regra de `workspace_id` obrigatório (specs/08, specs/09) é fortalecida:

```text
Authenticated Principal
        │
        ▼
Authorized Workspace Set
        │
        ▼
Request.workspace_id
        │
        ▼
MATCH?
   ┌────┴────┐
  YES        NO
   │          │
 ALLOW       DENY
```

> `workspace_id` enviado pelo cliente é uma **declaração de intenção/contexto**, não uma prova de autorização.

O Gateway valida o `workspace_id` contra o conjunto de workspaces autorizados para o principal autenticado. Essa validação é feita no Gateway, **e também** reforçada em:

- Application Layer
- Postgres (row-level filtering)
- Neo4j (property-level filtering)
- MCP tools (reject without workspace_id)
- Audit events

---

## 8. Tool Registry

O Gateway mantém um registry central de tools:

```text
Tool Registry Entry
    │
    ├── tool_id                  (identificador único da tool)
    ├── capability_required      (capability mínima para invocar)
    ├── workspace_required       (bool — workspace_id é obrigatório?)
    ├── mutability               (READ | READ_SIMULATION | READ_VERIFICATION | PROPOSAL | WRITE)
    ├── gate_required            (bool — requer GateResult PASS válido?)
    ├── risk_level               (low | medium | high | critical)
    ├── input_schema             (referência ao JSON Schema / Zod schema)
    └── output_classification    (FACT | SIMULATION_RESULT | INFERENCE | SUGGESTION)
```

### Registry inicial

| tool_id | capability | mutability | gate_required | risk |
|---|---|---|---|---|
| `query_combat` | `combat:query` | READ | false | low |
| `propose_changeset` | `combat:propose` | PROPOSAL | false | medium |
| `simulate_changeset` | `combat:simulate` | READ_SIMULATION | false | medium |
| `run_gate` | `combat:verify` | READ_VERIFICATION | false | medium |
| `explain_gate` | `combat:read` | READ | false | low |
| `impact_analysis` | `combat:query` | READ | false | low |
| `list_scenarios` | `combat:read` | READ | false | low |
| `withdraw_changeset` | `changeset:withdraw` | PROPOSAL | false | medium |
| `apply_changeset` | `changeset:apply` | WRITE | true | critical |

O Gateway usa esse registry para autorização. Regras de autorização não devem ser espalhadas arbitrariamente pelas tools.

---

## 9. Operation Classes

Quatro classes de operação, em ordem crescente de impacto:

```text
READ          — consultar dados existentes
PROPOSE       — criar/retirar propostas (ChangeSet lifecycle, sem persistir em canonical)
SIMULATE      — executar simulação determinística (resultado, não mutação)
VERIFY        — executar Mechanical Gate (resultado, não mutação)
APPLY         — alterar estado canônico (única operação de WRITE)
```

Somente `APPLY` altera estado canônico.

Os seguintes estados **nunca** podem ser interpretados como autorização para aplicar:

```text
FAIL
BLOCKED
STALE
BUDGET_EXCEEDED
ERROR
```

Somente um `GateResult` válido, não stale, compatível com o par exato `(model_revision, rule_set_version)`, com `simulation_hash` verificável, pode satisfazer a pré-condição mecânica de aplicação.

---

## 10. E2E Architectural Flows

### Flow A — Designer proposes change (happy path with initial failure)

```text
Designer
   ↓
LLM
   ↓
MCP Gateway  →  auth + capability check
   ↓
query_combat  →  FACT
   ↓
LLM
   ↓
propose_changeset  →  MCP Gateway  →  auth
   ↓
Application  →  validate  →  ChangeSet created
   ↓
simulate_changeset  →  MCP Gateway  →  auth
   ↓
Simulator  →  SimulationResult
   ↓
run_gate  →  MCP Gateway  →  auth
   ↓
Mechanical Gate  →  FAIL (INFINITE_COMBO_CYCLE)
   ↓
LLM explica resultado  →  propõe novo ChangeSet
   ↓
simulate  →  gate  →  PASS
   ↓
Human approval
   ↓
Application Apply
```

### Flow B — LLM attempts direct apply (denied)

```text
LLM
 ↓
apply_changeset
 ↓
MCP Gateway
 ↓
capability check: changeset:apply
 ↓
LLM default policy: DENY
 ↓
DENIED — audit event emitted
```

### Flow C — Cross-workspace attempt (denied)

```text
LLM (authorized for workspace A)
 ↓
query_combat(workspace_id = B)
 ↓
MCP Gateway
 ↓
workspace authorization: B ∉ authorized_workspaces
 ↓
DENIED — audit event emitted
```

---

## 11. Deployment

### MVP

O Gateway é um **package/process boundary** dentro do mesmo deployment, não um microserviço independente:

```text
packages/
├── mcp-gateway/
├── mcp-server/
├── application/
├── ingestion/
├── graph-adapter/
└── postgres-adapter/
```

Regra existente preservada:

> No microservices until load/isolation/ownership justify it.

A separação é **arquitetural e de responsabilidade**, não necessariamente de deployment.

### Extraction criteria

O Gateway pode ser extraído para um serviço independente quando:

- carga de requests justifica scaling independente;
- isolamento de falhas entre gateway e backend é necessário;
- ownership do código de segurança diverge do ownership de domínio;
- compliance exige boundary explícito.

Até lá, permanece como package no monorepo.

---

## 12. External MCP Infrastructure (StormMCP / etc.)

> StormMCP ou qualquer framework externo pode ser usado como transporte, registry, proxy ou infraestrutura MCP, mas **não deve ser a autoridade final de segurança do Combat Designer**.

A arquitetura permanece:

```text
External MCP infrastructure (opcional)
        ↓
Combat Designer MCP Gateway
        ↓
Application
```

Se um componente externo oferecer capabilities semelhantes (auth, routing, rate limiting), ele pode ser utilizado como camada complementar. Porém:

```text
Combat Designer Policy
Combat Designer Authorization
Workspace Isolation
Mechanical Gate Integrity
ChangeSet Apply Policy
```

devem continuar sob controle do sistema.

Se a infraestrutura externa for removida, o domínio de combate e suas garantias devem continuar funcionando. O domínio não deve ser acoplado a StormMCP.

---

## 13. Relationship to Other Specs

| Spec | Relationship |
|---|---|
| 00 — FIC | FIC deve declarar impacto em gateway, authorization, capability, tool-policy, audit |
| 01 — Canonical Model | Gateway não acessa o domain diretamente; usa Application como intermediário |
| 02 — Ingestion | Upload passa pelo API/Application, não pelo MCP Gateway (canal diferente) |
| 03 — KG | Gateway impede acesso direto ao Neo4j; queries passam por tools → Application → graph-adapter |
| 04 — Simulator | Gateway impede acesso direto ao simulador; simulações passam por tools → Application → Rust FFI |
| 05 — Mechanical Gate | Gateway impede bypass do Gate; `apply_changeset` requer GateResult PASS válido |
| 06 — MCP + LLM | Gateway é a fronteira; MCP Server define tools; ambos são implementados na spec 06 |
| 07 — Dashboard | Observability inclui métricas/traces do Gateway |
| 08 — Platform | workspace_id é autorizado pelo Gateway, não apenas declarado pelo client |
| 09 — Security | Execution limits aplicados em camadas: Gateway (request) → Application (business) → Simulator (deterministic) |
