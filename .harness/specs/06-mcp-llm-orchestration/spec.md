# Spec 06 — MCP Gateway + MCP Server + LLM Orchestration

**Status**: CANONICAL SPECIFICATION (TARGET ARCHITECTURE)  
**Owner**: Implementation Agent  

## Objetivo

Implementar a fronteira MCP segura (Gateway), a definição de tools/resources (MCP Server), e a orquestração entre LLM, tools, Application, KG, Simulator e Combat Analysis.

O fluxo canônico de produto é:

```text
User Request
    ↓
Intent Classification & Active Skill
    ↓
Authorized Tools (Gateway)
    ↓
Search / Simulation / Combat Analysis
    ↓
Findings + Evidence
    ↓
Combat Director
    ↓
Recommendation
```

Nenhum resultado de simulação ou diagnóstico pode ser fabricado pela LLM. O Combat Designer analisa, simula e recomenda; **nunca** muta diretamente a engine de jogo (Unity/Unreal).

---

## MCP Gateway

O Gateway é a **única fronteira de entrada MCP**. Ver `docs/architecture/mcp-gateway.md` para a especificação de responsabilidade, threat model, trust boundary, fail-closed e deployment.

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
- prevenção de acesso direto a recursos internos de persistência

### Regra fundamental

> Nenhuma operação MCP acessível ao LLM pode alterar estado canônico de engine diretamente. Operações são consultivas, analíticas ou diagnósticas.

---

## MCP Server

### Responsabilidades

- definição das tools canônicas
- schemas (Zod)
- resources
- classificação das respostas (FACT, SIMULATION_RESULT, INFERENCE, SUGGESTION)
- trust markings (`untrusted_text`)
- tradução MCP → application command/query

As tools **não** implementam autorização de forma independente. Elas recebem contexto autorizado pelo Gateway e obedecem às validações do Application Layer.

### Tools Canônicas de Runtime

```text
combat_search           - Busca ataques por tag, janela de cancel ou query
combat_get_attack       - Detalhes canônicos de um ataque específico
list_scenarios          - Lista cenários de combate cadastrados
impact_analysis         - Análise de impacto relacional via Knowledge Graph
combat_simulate         - Executa simulação determinística via Rust Simulator
combat_analyze          - Executa análise de combate e diagnósticos (Findings)
combat_find_combos      - Explora viabilidade de combos no grafo
```

### Ferramentas Legadas Desconectadas (`CODE_LEGACY_RUNTIME_GATE` / `MUST_REMOVE_NOW`)

> [!WARNING]
> As ferramentas abaixo pertenciam à arquitetura anterior com Gate de runtime ou ciclo de mutação direta. Foram classificadas como `MUST_REMOVE_NOW` e desconectadas do runtime de produto:
> - `run_gate` / `combat_verify`
> - `explain_gate` / `combat_explain_gate`
> - `combat_apply_change`
> - `propose_changeset` / `withdraw_changeset` (substituídos por fluxo de análises e recomendações)

### Resources Canônicos

```text
combat://model/{revision}
combat://attack/{id}
combat://scenario/{id}
combat://analysis/{analysis_id}
combat://provenance/{asset_id}
```

---

## Segurança

MCP não pode escrever diretamente em DB nem executar shell irrestrito. Ingestion recebe somente roots explicitamente autorizados.

Texto originado de asset de engine (nomes, comentários, strings de AnimNotify, tags) e devolvido via resource ou tool result é dado não confiável: deve ser tratado pelo LLM como conteúdo a analisar, nunca como instrução a seguir. A Application marca esses campos com `untrusted_text: true` na resposta para reforçar essa distinção.

Esta é a defesa primária contra prompt injection indireta. specs/09 adiciona sanitização de `name` contra charset restrito, com o valor bruto preservado como `raw_label`/`untrusted_text`, como defesa em profundidade.

Toda chamada de tool carrega `workspace_id` como parte do auth scope. O Gateway valida `workspace_id` contra o conjunto autorizado do principal — o `workspace_id` enviado pelo cliente é declaração de intenção, não prova de autorização.

---

## Retirada do Lifecycle de ChangeSet / Apply (`LEGACY_PRODUCT_DIRECTION`)

> [!NOTE]
> O ciclo histórico `ChangeSet → simulate → gate → approve → apply` pertence a uma direção de produto descontinuada (`LEGACY_PRODUCT_DIRECTION`).
>
> O Combat Designer é uma ferramenta de **design, diagnóstico e recomendação consultiva**. Ele não muta a engine Unity diretamente. O designer humano avalia as recomendações e decide se e como aplicá-las manualmente na engine.
>
> Os use cases históricos `apply-changeset.ts` e `approve-changeset.ts` foram removidos do pipeline canônico de produto.

---

## Alinhamento com a SPEC 13 (Combat Director Chat & Safety)

1. **Fluxo Consultivo Exclusivo**: O Combat Director opera no pipeline canônico:
   `User Request → Skill → Authorized Tools → Simulation / Analysis → Findings + Evidence → Recommendation`.
2. **Ausência de Mutação Direta**: O Combat Director **não possui ferramenta `combat_apply_change`** nem altera diretamente a engine/Unity.
3. **Tool Allowlist por Skill**: Toda chamada de ferramenta pelo assistente deve pertencer à allowlist declarada na Skill ativa (`SkillRegistry`), retornando `TOOL_DENIED` caso contrário.
4. **Terminologia Canônica**: Utilizar *Combat Analysis*, *Findings*, *Diagnostics* e *Evidence*. A terminologia *Mechanical Validation* fica reservada estritamente para o ambiente de harness durante validação de código.
