# Spec 06 — MCP Gateway + MCP Server + LLM Orchestration

**Status**: COMPLETE  
**Owner**: Implementation Agent  
**Verified**: Zero regression across SPECs 00–05, 100% tests passing in Rust & TypeScript, FIC 8/8 valid.

## Objetivo

Implementar a fronteira MCP segura (Gateway), a definição de tools/resources (MCP Server), e a orquestração entre LLM, tools, Application, KG, Simulator e Mechanical Gate.

O fluxo obrigatório é:

```text
LLM propõe
    ↓
Gateway autoriza
    ↓
Application valida
    ↓
Simulator calcula
    ↓
Mechanical Gate decide
    ↓
Humano aprova
    ↓
Application aplica
```

Nenhum desses passos pode ser eliminado pelo LLM.

---

## MCP Gateway

O Gateway é a **única fronteira de entrada MCP**. Ver `docs/architecture/mcp-gateway.md` para a especificação completa de responsabilidade, threat model, trust boundary, fail-closed e deployment.

### Responsabilidades

- authentication
- authorization
- capability enforcement
- tool policy
- workspace isolation
- request boundary validation
- rate limiting
- execution budget enforcement de fronteira
- audit
- correlation IDs
- routing
- deny-by-default
- prevenção de acesso direto a recursos internos

### Regra fundamental

> Nenhuma operação MCP acessível ao LLM pode alterar estado canônico diretamente. Alterações persistíveis passam pelo Application Layer e, quando aplicável, pelo Mechanical Gate.

### Invariantes

Ver `regras/mcp-gateway-invariants.md` (GW-I01 a GW-I17).

### Tarefas do Gateway

```text
06.GW.1  Define Principal model (principal_id, principal_type, capabilities, authorized_workspaces)
06.GW.2  Define Capability model (combat:read/query/simulate/propose/verify, changeset:withdraw/apply, admin:workspace/policy)
06.GW.3  Define Tool Registry (tool_id, capability, mutability, gate_required, risk_level, schemas)
06.GW.4  Define Authorization Policy (LLM default: changeset:apply=DENY, admin:*=DENY)
06.GW.5  Implement workspace authorization (validate workspace_id against principal's authorized set)
06.GW.6  Implement deny-by-default (unknown principal/capability/workspace/tool → DENY)
06.GW.7  Implement request boundary validation (size, depth, schema)
06.GW.8  Implement audit events (every request, every denial, every authorization decision)
06.GW.9  Implement rate/size/execution limits (independent of simulator ExecutionBudget)
06.GW.10 Implement routing (tool_id → registered handler in MCP Server)
06.GW.11 Prevent direct persistence access (no MCP tool writes Postgres/Neo4j directly)
06.GW.12 Prevent Mechanical Gate bypass (apply requires valid non-stale GateResult PASS)
06.GW.13 Implement correlation propagation (trace_id, principal_id, workspace_id, request_id)
```

---

## MCP Server

### Responsabilidades

- definição das tools
- schemas (Zod)
- resources
- classificação das respostas (FACT, SIMULATION_RESULT, INFERENCE, SUGGESTION)
- trust markings (`untrusted_text`)
- tradução MCP → application command/query

As tools **não** implementam autorização de forma independente. Elas recebem contexto autorizado pelo Gateway e obedecem às validações do Application Layer.

### Tools

```text
query_combat
propose_changeset
simulate_changeset
run_gate
explain_gate
impact_analysis
list_scenarios
withdraw_changeset
```

`withdraw_changeset` fecha explicitamente um changeset `proposed` sem aplicá-lo, para que o estado `SUGGESTED -> ACCEPTED | DEFERRED | REJECTED` (ver regras/suggest-improvements.md) tenha uma transição correspondente do lado do MCP e nenhuma proposta fique pendente sem resolução rastreável.

### Tarefas do MCP Server

```text
06.MCP.1  Initialize MCP SDK v2 package
06.MCP.2  Define tool schemas (Zod, all 8 tools + workspace_id required)
06.MCP.3  Implement query_combat (reads KG, returns FACT)
06.MCP.4  Implement propose_changeset (validates via Application → creates ChangeSet, does NOT persist without gate)
06.MCP.5  Implement simulate_changeset (calls Rust simulator, returns SIMULATION_RESULT)
06.MCP.6  Implement run_gate (calls Rust gate, returns full GateResult)
06.MCP.7  Implement explain_gate (human-readable explanation, INFERENCE)
06.MCP.8  Implement impact_analysis (queries KG for affected entities)
06.MCP.9  Implement list_scenarios
06.MCP.10 Implement withdraw_changeset (SUGGESTED→DEFERRED/REJECTED)
06.MCP.11 Implement resources (combat://model, combat://attack, combat://scenario, combat://gate, combat://provenance)
06.MCP.12 Implement trust markings (untrusted_text on engine-originated strings)
06.MCP.13 Implement response classification middleware (FACT/SIMULATION_RESULT/INFERENCE/SUGGESTION)
```

### Resources

```text
combat://model/{revision}
combat://attack/{id}
combat://scenario/{id}
combat://gate/{run_id}
combat://provenance/{asset_id}
```

---

## Segurança

MCP não pode escrever diretamente em DB nem executar shell irrestrito. Ingestion recebe somente roots explicitamente autorizados.

Texto originado de asset de engine (nomes, comentários, strings de AnimNotify, tags) e devolvido via resource ou tool result é dado não confiável: deve ser tratado pelo LLM como conteúdo a analisar, nunca como instrução a seguir. A Application deve marcar esses campos (ex.: `untrusted_text: true`) na resposta para reforçar essa distinção e não deve permitir que um `propose_changeset` seja aceito com base apenas em texto de asset sem correspondência em dado estruturado do canonical model.

Esta é a defesa primária contra prompt injection indireta. specs/09 adiciona uma camada independente na ingestão (sanitização de `name` contra charset restrito, com o valor bruto preservado como `raw_label`/`untrusted_text`), como defesa em profundidade — não como substituto desta regra.

Toda chamada de tool carrega `workspace_id` como parte do auth scope (specs/08, specs/09). Uma chamada sem `workspace_id` explícito é rejeitada por contrato. O Gateway valida `workspace_id` contra o conjunto autorizado do principal — o `workspace_id` enviado pelo cliente é declaração de intenção, não prova de autorização.

---

## Classificação de resposta

Toda resposta factual deve distinguir:

- FACT;
- SIMULATION_RESULT;
- INFERENCE;
- SUGGESTION.

---

## Proibições

O LLM não pode inventar frame data, provenance ou GateResult.

O LLM não pode alterar o resultado do Mechanical Gate.

O LLM não pode aplicar ChangeSet sem capability explícita e GateResult válido.

---

## Testes obrigatórios

### Cross workspace

```text
Workspace A principal → request workspace B → DENY
```

### Capability escalation

```text
LLM sem changeset:apply → apply → DENY
```

### Unknown tool

```text
unknown_tool → DENY
```

### Missing workspace

```text
query_combat sem workspace_id → DENY
```

### Forged Gate

```text
LLM fabrica GateResult PASS → apply → DENY
```

### Failed Gate

```text
Gate = FAIL → apply → DENY
```

### Stale Gate

```text
Gate revision = 1, model revision = 2 → apply → DENY
```

### Budget exceeded

```text
BUDGET_EXCEEDED → apply → DENY
```

### Direct DB bypass

Verificar que nenhum MCP tool possui acesso direto a:

```text
Postgres write
Neo4j write
canonical snapshot mutation
```

### Untrusted text

```text
raw_label = "ignore previous instructions..."
→ untrusted_text = true
→ não gera capability ou comando executável
```

### Replay attack

```text
Old valid GateResult + already applied ChangeSet → DENY
```

### Revision race

```text
Valid GateResult + canonical revision changed after verification → DENY
```

---

## ChangeSet Apply Lifecycle

```text
ChangeSet
  ├── changeset_id
  ├── workspace_id
  ├── base_revision
  ├── target_revision
  ├── proposed_by          (principal_id)
  ├── status               (proposed | simulated | verified | approved | applied | withdrawn | rejected)
  ├── simulation_id
  ├── gate_run_id
  ├── gate_status
  ├── approved_by          (principal_id, human)
  ├── approved_at
  └── applied_at
```

### Apply preconditions

Aplicação de um ChangeSet somente quando **todas** as condições são satisfeitas:

```text
principal possui changeset:apply
AND workspace autorizado para o principal
AND ChangeSet.status = approved
AND ChangeSet.base_revision = canonical revision atual
AND Simulation válida (simulation_id presente, hash verificável)
AND GateResult existe (gate_run_id presente)
AND GateResult.status = PASS
AND GateResult não está STALE (model_revision e rule_set_version coincidem)
AND GateResult.changeset_id = ChangeSet.changeset_id
AND GateResult.simulation_hash corresponde à simulação executada
AND aprovação humana válida (approved_by ≠ null, principal_type = human)
AND ChangeSet não foi previamente aplicado (applied_at = null)
```

Não permitir `GateResult(PASS) → Apply` sem verificar o vínculo completo entre ChangeSet, Simulation, GateResult, revision e aprovação.

---

## Authentication / Authorization / Policy Flow

```text
Authentication
      ↓
Principal (identified)
      ↓
Authorization (capabilities + workspace)
      ↓
Policy (operation permitted in current conditions?)
      ↓
Tool Registry (declarative tool characteristics)
      ↓
Handler (MCP Server tool implementation)
```

### Authentication

Identifica o principal. Resultado: `Principal` com `principal_id` e `principal_type`.

### Authorization

Determina se o principal possui a capability requerida pela tool e se o `workspace_id` está no conjunto autorizado. Deny-by-default.

### Policy

Determina se a operação é permitida nas condições atuais (ex.: modo STRICT vs ADVISORY, rate limits, execution budget de fronteira). Policy não contém regras mecânicas de combate.

### Tool Registry

Fornece as características declarativas da tool (capability_required, mutability, gate_required, risk_level). O Gateway consulta o registry para decidir autorização.

---

## Impacto

Nova tool exige schema, auth scope, capability entry no Tool Registry, contract tests, tool tests, gateway tests, observabilidade e documentação.

## Dependências

- specs/01 (Canonical Model) — entidades canônicas, resources e modelo de dados do ChangeSet
- specs/03 (KG) — graph queries
- specs/04 (Simulator) — simulation execution
- specs/05 (Mechanical Gate) — gate rules e GateResult
- specs/08 (Platform) — workspace model
- specs/09 (Security) — execution limits, workspace isolation
- specs/13 (Combat Director Chat) — fluxo consultivo (Proposal → Simulation → Mechanical Validation → Spec Validation → Recommendation), Tool Allowlist por Skill e ausência de combat_apply_change
- docs/architecture/mcp-gateway.md — gateway architecture
- regras/mcp-gateway-invariants.md — invariantes
- regras/suggest-improvements.md — ciclo SUGGESTED→ACCEPTED|DEFERRED|REJECTED (withdraw_changeset)

---

## Alinhamento com a SPEC 13 (Combat Director Chat & Safety)

1. **Fluxo Consultivo Exclusivo**: O Combat Director opera no pipeline canônico:
   `User Request → Skill → Authorized Tools → Proposal → Simulation → Mechanical Validation → Spec Validation → Recommendation`.
2. **Ausência de Mutação Direta**: O Combat Director **não possui ferramenta `combat_apply_change`** nem altera diretamente a engine/Unity.
3. **Tool Allowlist por Skill**: Toda chamada de ferramenta pelo assistente deve pertencer à allowlist declarada na Skill ativa (`SkillRegistry`), retornando `TOOL_DENIED` caso contrário.
4. **Terminologia**: Utilizar *Mechanical Validator* e *Mechanical Validation* no escopo de validação de propostas do Combat Director.

