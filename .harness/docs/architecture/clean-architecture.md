# Clean Architecture & Layering Boundaries

O Combat Designer adota estritamente os princípios de **Clean Architecture** e **Ports and Adapters (Hexagonal Architecture)**, com separação explícita entre a **arquitetura do produto em tempo de execução** e o **harness de desenvolvimento**.

---

## 1. Fluxo do Produto (Product Runtime Flow)

```text
LLM           = INTENTION    ("Quero analisar o startup do slash")
MCP Gateway   = CAN I?       (Autenticação, capabilities, workspace isolation)
MCP Server    = TRANSLATE    (Mapeia tools MCP para Application)
Application   = IS VALID?    (Valida integridade do input, orquestra portas)
Simulator     = WHAT HAPPENS?(Calcula o resultado mecânico frame a frame)
Analysis      = WHAT IS OBSERVED? (Diagnostica problemas mecânicos e emite Findings)
Director      = WHAT TO DO?  (Interpreta findings e gera recomendação consultiva)

                          User
                           ↓
                    JWT Authentication
                           ↓
                        Workspace
                           ↓
                    Unity Ingestion
                           ↓
                  Canonical Combat Domain
                           ↓
               Neo4j Knowledge Graph Projection
                           ↓
               Deterministic Rust Simulation
                           ↓
                    ┌→ Combo Search
SimulationResult ───┼→ Combat Analysis → Findings + Evidence
                    ├→ Diagnostics
                    └→ Comparison
                           ↓
         TypeScript Application / Combat Director Orchestration
                           ↓
                     Combat Director
                           ↓
                     Recommendation
```

> [!NOTE]
> **Diferenciação Estrita de "Skills"**:
> - **Runtime Agent Skills**: Capacidades analíticas do Combat Director no produto (ex: search, combo analysis, simulation).
> - **Harness Skills** (`.harness/skills/`): Procedimentos reutilizáveis do coding agent para verificação de código da codebase.
> - **Invariante**: O runtime do produto **nunca** depende de `.harness/skills/`.

---

## 2. Fluxo do Harness de Desenvolvimento (Development Harness Flow)

```text
Developer / Coding Agent
         ↓
       Specs
         ↓
       Rules
         ↓
       Skills
         ↓
    Implementation
         ↓
       Tests
         ↓
 Mechanical / Architectural Gate
         ↓
 PASS / FAIL (aceitação de implementação)
```

> [!IMPORTANT]
> `PASS`, `FAIL` e `BLOCKED` são semânticas exclusivas do **harness de desenvolvimento**. Elas atestam se o código implementado satisfaz os contratos do repositório — nunca se o conteúdo de jogo do usuário foi "aprovado".

---

## 3. Definição das Camadas

### 3.1 Domain (`engine/src/domain`)
* **Responsabilidade**: Núcleo canônico puro, agnóstico a engine. Modela entidades de combate (`Attack`, `Hitbox`, `CancelRule`, `CombatState`, etc.) e valida invariantes mecânicos fundamentais em tempo de construção.
* **Isolamento**: 0 dependências de infraestrutura, web, banco de dados ou relógio de sistema.

### 3.2 Simulator Engine (`engine/src/simulation`)
* **Responsabilidade**: Responde **"WHAT HAPPENS?"**. Executa a simulação temporal determinística a partir de um estado inicial, inputs e modelo canônico.
* **Isolamento**:
  * Baseado estritamente em inteiros (`FrameClock: u32/u64`).
  * Proibido uso de floats (`f32`/`f64`) para física ou lógica de combate.
  * Proibido uso de relógio de parede (`std::time::{Instant, SystemTime}`).
  * Bounded por `ExecutionBudget`.
  * Determinístico: 100 execuções produzem o mesmo `StateHash` (SHA-256).
  * **Não decide segurança nem aprovação**: Simula e emite trace, eventos e métricas.

### 3.3 Combat Analysis Engine (Target: `engine/src/analysis` & `backend/src/modules/combat`)
* **Responsabilidade**: Responde **"WHAT IS OBSERVED IN THIS COMBAT TIMELINE?"**. Inspeciona `SimulationResult` e projeções do grafo, emitindo `Finding[]`, diagnósticos estruturados e evidências frame a frame.
* **Isolamento**:
  * Produz `AnalysisResult` com status `COMPLETED`, `INCONCLUSIVE`, `BUDGET_EXCEEDED`, `STALE`, `ERROR`.
  * **Não emite vereditos de aprovação**: `PASS`, `FAIL` e `BLOCKED` são terminantemente proibidos no runtime.
  * Preserva integridade de inteiros e ordenação determinística de evidências.

### 3.4 Application (`backend/src/modules/*`)
* **Responsabilidade**: Orquestra casos de uso do sistema. Valida a intenção das requisições (**"IS VALID?"**) e invoca portas conceituais (`SimulationPort`, `CombatAnalysisPort`, `CombatQueryPort`).
* **Isolamento**: Não conhece implementações de banco (PostgreSQL, Neo4j) nem detalhes internos de baixo nível do Rust. Interage exclusivamente através de portas e contratos tipados.

### 3.5 Infrastructure & Adapters
* **Responsabilidade**: Implementações concretas de portas:
  * `backend/src/infrastructure/provider/neo4j`: Adaptador de projeção e busca no Neo4j.
  * `backend/src/infrastructure/provider/ingestion`: Adaptador de parsing de Export Bundles da Unity.
  * `NativeSimulationAdapter`: Adaptador que invoca o simulador determinístico.
* **Regra**: Conhece drivers e tecnologias de persistência, mas não contém regras de domínio.

### 3.6 MCP Gateway & MCP Server
* **MCP Gateway** (`mcp/gateway`): Fronteira de segurança. Autenticação, resolução de principal, autorização, isolamento de workspace, rate limits e auditoria. Não conhece regras de combate.
* **MCP Server** (`mcp/server`): Tradução de protocolos e exposição de ferramentas canônicas para LLMs (`combat_search`, `combat_simulate`, `combat_analyze`, etc.). Não possui autoridade mecânica e nunca escreve em bancos diretamente.

---

## 4. Code Divergence Registry (`MUST_REMOVE_NOW`)

> [!WARNING]
> O módulo histórico `engine/src/verification` e os use cases `apply-changeset.ts` / `approve-changeset.ts` implementavam aprovação de runtime com `MechanicalGatePort` e `GateResult`. Esses componentes foram classificados como `CODE_LEGACY_RUNTIME_GATE` (`MUST_REMOVE_NOW`) e desconectados do pipeline canônico de produto.
