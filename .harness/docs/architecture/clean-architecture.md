# Clean Architecture & Layering Boundaries

O Combat Designer adota estritamente os princípios de **Clean Architecture** e **Ports and Adapters (Hexagonal Architecture)**.

---

## 1. Fluxo Canônico e Hierarquia de Responsabilidades

```text
LLM
  ↓
MCP Gateway ("CAN I?")
  ↓
MCP Server ("TRANSLATE")
  ↓
Application ("IS VALID?")
  ↓
Ports (e.g. SimulationPort)
  ↓
Infrastructure / Adapters (Native Engine Adapter)
  ↓
Rust Engine (combat-simulation) ("WHAT HAPPENS?")
  ↓
Simulation Result
  ↓
Mechanical Gate (combat-verification) ("IS SAFE?")
  ↓
Human Approval
  ↓
Apply
```

---

## 2. Definição das Camadas

### 2.1 Domain (`engine/combat-domain`)
* **Responsabilidade**: Núcleo canônico puro, agnóstico a engine. Modela entidades de combate (`Attack`, `Hitbox`, `CancelRule`, `CombatState`, etc.) e valida invariantes mecânicos fundamentais em tempo de construção.
* **Isolamento**: 0 dependências de infraestrutura, web, banco de dados ou relógio de sistema.

### 2.2 Simulator Engine (`engine/combat-simulation`)
* **Responsabilidade**: Responde **"WHAT HAPPENS?"**. Executa a simulação temporal determinística a partir de um estado inicial, inputs e modelo canônico.
* **Isolamento**:
  * Baseado estritamente em inteiros (`FrameClock: u32/u64`).
  * Proibido uso de floats (`f32`/`f64`) para física ou lógica de combate.
  * Proibido uso de `std::time::{Instant, SystemTime}`.
  * Bounded por `ExecutionBudget`.
  * Determinístico: 100 execuções produzem o mesmo `StateHash` (SHA-256).
  * **Não decide segurança**: Simula e gera métricas/eventos; não decide PASS/FAIL de mecânica.

### 2.3 Application (`backend/application`)
* **Responsabilidade**: Orquestra casos de uso do sistema. Valida a intenção das requisições (**"IS VALID?"**) e invoca portas conceituais (`SimulationPort`).
* **Isolamento**: Não conhece implementações de banco (PostgreSQL, Neo4j) nem detalhes internos de baixo nível do Rust. Interage exclusivamente através de portas e contratos tipados.

### 2.4 Contracts (`backend/contracts`)
* **Responsabilidade**: Contratos de fronteira e serialização entre camadas (TypeScript).
* **Regra Crítica**: Contratos de fronteira não duplicam lógica mecânica (não implementam detecção de colisão, progressão de frame ou cálculo de dano).

### 2.5 Infrastructure & Adapters
* **Responsabilidade**: Implementações concretas de portas:
  * `backend/infrastructure/neo4j`: Adaptador de projeção e busca no Neo4j.
  * `backend/infrastructure/ingestion`: Adaptador de parsing e extração de assets de engines (Unity, etc.).
  * `NativeSimulationAdapter`: Adaptador que invoca o `combat-simulation` e traduz DTOs.
* **Regra**: Conhece drivers e tecnologias de persistência, mas não contém regras de domínio.

### 2.6 MCP Gateway & MCP Server
* **MCP Gateway** (`mcp/gateway`): Fronteira de segurança. Autenticação, resolução de principal, autorização, isolamento de workspace, rate limits e auditoria. Não conhece regras de combate.
* **MCP Server** (`mcp/server`): Tradução de protocolos e exposição de ferramentas para LLMs. Não possui autoridade mecânica e nunca escreve em bancos diretamente.
