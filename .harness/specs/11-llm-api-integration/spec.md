# Spec 11 — Integração de API LLM para Orquestração do Chat

## Status: READY FOR IMPLEMENTATION

## Overview

O **SPEC 11** implementa a integração real com a **Gemini API** no backend do Combat Designer, substituindo o mock determinístico da rota `POST /api/workspaces/:workspace_id/chat` por chamadas reais à LLM com **function calling**.

O sistema dispõe de motores de domínio determinísticos (Rust crates), pipeline de ingestão segura (SPECs 02, 08 e 09), Knowledge Graph (SPEC 03), simulador determinístico (SPEC 04), Mechanical Gate (SPEC 05), MCP gateway/server (SPEC 06), observabilidade (SPEC 07), frontend completo (SPEC 10) — mas a orquestração de chat operava via switch determinístico por keyword. O SPEC 11 transforma o chat em um canal de orquestração LLM real onde o modelo decide quais ferramentas de combate chamar.

---

## 1. Princípios Arquiteturais & Invariantes

1. **Porta Abstrata (`LlmProvider`)**: A integração com a LLM é feita através de uma porta de domínio (`LlmProvider`), com adaptador concreto para Gemini (`GeminiProvider`). Testes injetam um mock — nenhuma chamada real à API é feita em CI.

2. **Function Calling Loop**: O `ChatOrchestrator` implementa um loop de function calling onde:
   - A LLM recebe as declarações de ferramentas de combate
   - A LLM decide quais ferramentas chamar baseado no prompt do usuário
   - O backend executa as ferramentas e retorna resultados à LLM
   - A LLM processa os resultados e gera a resposta final
   - Máximo de 5 rounds (`MAX_TOOL_CALL_ROUNDS`) para evitar loops infinitos

3. **Preservação de Vereditos Mecânicos**: Vereditos do Mechanical Gate (`PASS`, `FAIL`, `BLOCKED`, `STALE`, `BUDGET_EXCEEDED`) retornados por `combat_verify` são preservados integralmente. A LLM não pode fabricar ou sobrescrever esses vereditos.

4. **Fluxo Consultivo Canônico (Alinhamento SPEC 13)**:
   - A LLM atua exclusivamente como assistente de análise no pipeline:
     `User Request → Skill → Authorized Tools → Proposal → Simulation → Mechanical Validation → Spec Validation → Recommendation`.
   - NUNCA existe ferramenta `combat_apply_change` ou aprovação direta de mudanças pelo assistente.
   - Ferramentas autorizadas são restritas por allowlist da Skill ativa (`SkillRegistry`).
   - Requisições fora de escopo (`OUT_OF_SCOPE`) são rejeitadas imediatamente sem acionar ferramentas ou simulações.

5. **Fallback Gracioso**: Quando `GEMINI_API_KEY` não está configurado ou o `LlmProvider` não é injetado, a rota mantém o mock determinístico como fallback — garantindo backward compatibility.

6. **Isolamento de Workspace e Projeto**: Todas as chamadas são estritamente associadas à identidade `(user_id, workspace_id, conversation_id)` conforme SPECs 12 e 13.


---

## 2. Arquitetura

### Camadas

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| **Domain Port** | `backend/src/modules/llm/domain/port/llm-provider.ts` | Interface `LlmProvider` — abstração de API LLM |
| **Infrastructure Adapter** | `backend/src/infrastructure/provider/llm/gemini-provider.ts` | Implementação concreta com `@google/genai` SDK |
| **Application Service** | `backend/src/modules/llm/service/chat-orchestrator.ts` | Loop de function calling + execução de ferramentas |
| **Tool Declarations** | `backend/src/modules/llm/service/combat-tool-declarations.ts` | Mapeamento MCP handlers → Gemini function declarations |
| **HTTP Integration** | `backend/src/infrastructure/http/server.ts` | Integração na rota POST /chat |

### Fluxo de Dados

```
Frontend (Director Chat)
  │ POST /chat { prompt, context: LlmPromptContextEnvelope }
  ▼
ApiServer (HTTP Route)
  │ Monta ChatContextEnvelope
  ▼
ChatOrchestrator (Application Service)
  │ 1. Constrói system prompt com regras do Combat Director
  │ 2. Converte tool schemas para LlmToolDeclarations
  ▼
LlmProvider.chat() → Gemini API (gemini-3.7-flash)
  │ 3. LLM analisa prompt + context + tools disponíveis
  │ 4. LLM retorna function_calls ou texto
  ▼
Tool Execution Loop (max 5 rounds)
  │ 5. Backend executa cada tool call:
  │    - combat_search → queryPort.search()
  │    - combat_simulate → simulationPort.simulate()
  │    - combat_verify → gatePort.verify()
  │    - combat_propose_change → saveChangeset()
  │    - combat_explain_gate → gate explanation
  │    - combat_impact_analysis → impact data
  │    - list_scenarios → scenario listing
  │ 6. Resultados enviados de volta à LLM
  ▼
Resposta Final
  │ { reply, tool_calls[], proposed_changeset?, context_envelope }
  ▼
Frontend (renderiza resposta + tool call cards)
```

---

## 3. Dependências

| Pacote | Versão | Motivo |
|---|---|---|
| `@google/genai` | `^1.0.0` | SDK oficial para Gemini API (function calling, multi-turn) |

**Variável de ambiente**: `GEMINI_API_KEY` — API key para autenticação com a Gemini API.

---

## 4. Ferramentas Disponíveis para a LLM

| Nome | Descrição | Parâmetros Requeridos |
|---|---|---|
| `combat_search` | Busca ataques por query/tag/cancel window | Nenhum (todos opcionais) |
| `combat_simulate` | Simulação determinística | `scenario_id` |
| `combat_verify` | Verificação via Mechanical Gate | `project_id` |
| `combat_propose_change` | Propõe ChangeSet | `base_revision`, `target_revision`, `mutations` |
| `combat_explain_gate` | Explica veredito de Gate | `gate_run_id` |
| `combat_impact_analysis` | Análise de impacto | `attack_id` |
| `list_scenarios` | Lista cenários | Nenhum |

---

## 5. System Prompt do Combat Director

O system prompt é construído dinamicamente para cada turno, incluindo:
- Workspace ID, snapshot hash, ataques selecionados, changeset ativo
- Regras cardinais: não fabricar vereditos, não aprovar changesets, usar apenas o workspace autorizado
- Workflow canônico: LLM propõe → Gateway autoriza → Application valida → Simulator calcula → Mechanical Gate decide → Human approva → Application aplica

---

## 6. Testes

| ID | Tipo | Teste | Validação |
|---|---|---|---|
| 11.T.1 | Integração | Chat com mock LlmProvider retorna resposta textual | `reply` presente, `tool_calls` vazio |
| 11.T.2 | Integração | Chat com function call `combat_search` | Loop executa search, retorna resultado |
| 11.T.3 | Integração | Chat com `combat_propose_change` cria changeset | Changeset salvo, retornado na resposta |
| 11.T.4 | Integração | Loop respeita MAX_TOOL_CALL_ROUNDS | Após 5 rounds, para com aviso |
| 11.T.5 | Integração | Fallback ao mock sem LlmProvider | Backward compat com SPEC 10 |
| 11.T.6 | Integração | System prompt contém context do envelope | Mock verifica conteúdo do prompt |
| 11.T.7 | Integração | Erro do LlmProvider retorna 503 | HTTP 503 com mensagem de erro |
| 11.U.1 | Unitário | Tool declarations válidas | 7 ferramentas com schemas corretos |
| 11.U.2 | Unitário | Execução de combat_search | queryPort.search chamado corretamente |
| 11.U.3 | Unitário | Preserva untrusted_text | Resultados marcados corretamente |
| 11.U.4 | Unitário | Rejeita tool inexistente | Error para tool não registrada |
| 11.U.5 | Unitário | Preserva mechanical gate verdict | Verdict não sobrescrito |
