# MCP Gateway — Architecture Document

## 1. Responsabilidade

O MCP Gateway é a **única fronteira de entrada MCP** para operações do Combat Designer.

Ele existe para garantir que nenhum agente, LLM ou cliente MCP possa:

- acessar diretamente banco de dados (Postgres/Neo4j);
- acessar diretamente o filesystem do host;
- acessar diretamente o motor de simulação sem validação de limites;
- alterar o estado canônico do projeto ou mutar assets de jogo (Unity/Unreal);
- acessar workspaces de outros usuários sem autorização (*tenant isolation*);
- invocar tools desconhecidas ou fora da allowlist da Skill ativa;
- executar operações administrativas sem capability explícita.

O Gateway **não é** o avaliador de balanceamento. Ele não decide se um ataque é balanceado.

Cada camada responde uma pergunta diferente:

```text
Gateway:         "CAN I?"         — Este principal pode executar esta operação no workspace?
Application:     "IS VALID?"      — Este request é estruturalmente válido e autenticado?
Simulator:       "WHAT HAPPENS?"  — Qual é o resultado mecânico frame a frame?
Combat Analysis: "WHAT IS OBSERVED?" — Quais diagnósticos, ciclos ou anomalias foram detectados?
Director:        "WHAT TO DO?"    — Qual a recomendação consultiva fundamentada em evidências?
```

Nenhum resultado de simulação ou diagnóstico pode ser fabricado ou contornado pelo LLM.

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
│       MCP Gateway        │  ← primeira fronteira de confiança (Fail-Closed)
└──────────┬───────────────┘
           │
           ▼
TRUSTED APPLICATION DOMAIN
    │
    ├── Application Layer
    ├── Canonical Domain (Rust)
    ├── Deterministic Simulator (Rust)
    ├── Combat Analysis Engine (Rust)
    ├── Knowledge Graph (Neo4j)
    └── Persistence (Postgres)
```

---

## 3. Threat Model

### TM-01 — Prompt injection via combat data
Texto originado de assets (nomes de ataques, comentários, labels de hitbox) é marcado com `untrusted_text: true` e tratado estritamente como dado a analisar, nunca como instrução executável.

### TM-02 — Cross-workspace access
Qualquer requisição tentando ler dados de outro `workspace_id` é sumariamente rejeitada pelo Gateway e barrada por filtros de nível de linha/propriedade no Postgres e Neo4j.

### TM-03 — Privilege escalation
A LLM opera com capacidades restritas por padrão. Capabilities administrativas (`admin:*`) são estritamente negadas (`DENY`) para agentes conversacionais.

### TM-04 — Forged Simulation/Analysis Result
A LLM não pode sintetizar respostas fingindo ter simulado combate ou gerado evidências. Todas as evidências devem originar-se dos motores determinísticos através de chamadas de ferramenta autorizadas.

### TM-05 — Direct mutation attempts
O Combat Designer não possui ferramentas de escrita direta em engines de jogo externas (Unity/Unreal). Recomendações geradas pelo Combat Director são consultivas. Qualquer tentativa de invocar ferramentas de mutação direta é rejeitada.

### TM-06 — Execution budget exhaustion
Callers submetendo simulações excessivamente longas são limitados pelo `ExecutionBudget` da simulação e pelo `AnalysisBudget` do motor de análise, retornando `BUDGET_EXCEEDED` sem travar a infraestrutura.

---

## 4. Fail Closed

O Gateway opera em modo fail-closed:

```text
unknown principal            → DENY
unknown capability           → DENY
unknown workspace            → DENY
workspace mismatch           → DENY
unknown tool                 → DENY
invalid request              → DENY
policy unavailable           → DENY
authorization timeout        → DENY
missing workspace_id         → DENY
tool not in skill allowlist  → DENY
```

---

## 5. Principal Model & Capabilities

### Capabilities Canônicas de Produto

```text
combat:read           — consultar combat model, catálogo, provenance
combat:query          — executar queries relacionais no Knowledge Graph
combat:simulate       — executar simulações determinísticas no Rust simulator
combat:analyze        — executar análise de combate e diagnósticos (Findings)
admin:workspace       — gerenciar projetos e workspaces do usuário
admin:policy          — gerenciar políticas de autorização de plataforma
```

### LLM Default Policy

```text
combat:read           ALLOW
combat:query          ALLOW
combat:simulate       ALLOW
combat:analyze        ALLOW
admin:*               DENY
```

---

## 6. Tool Registry Canônico de Runtime

| tool_id | capability | mutability | risk_level | output_classification |
|---|---|---|---|---|
| `combat_search` | `combat:read` | READ | low | FACT |
| `combat_get_attack` | `combat:read` | READ | low | FACT |
| `list_scenarios` | `combat:read` | READ | low | FACT |
| `impact_analysis` | `combat:query` | READ | low | FACT |
| `combat_simulate` | `combat:simulate` | READ_SIMULATION | medium | SIMULATION_RESULT |
| `combat_analyze` | `combat:analyze` | READ_ANALYSIS | medium | ANALYSIS_RESULT |
| `combat_find_combos` | `combat:query` | READ | low | FACT |

> [!WARNING]
> **Ferramentas Legadas Desconectadas (`MUST_REMOVE_NOW`)**:
> As ferramentas `run_gate`, `explain_gate`, `combat_verify`, `combat_explain_gate`, `combat_apply_change` e `create_proposal` pertenciam ao fluxo descontinuado de mutação de engine e foram removidas do catálogo ativo.

---

## 7. Fluxo Consultivo Ponta a Ponta

```text
Designer / Usuário
   ↓
Combat Director (LLM)
   ↓
MCP Gateway  →  validação de workspace + capability + allowlist da Skill ativa
   ↓
combat_search / impact_analysis  →  FACT
   ↓
combat_simulate  →  SimulationResult determinístico
   ↓
combat_analyze  →  Findings + Evidence estruturadas
   ↓
Combat Director interpreta diagnósticos  →  Recomendação fundamentada entregue no Chat
```
