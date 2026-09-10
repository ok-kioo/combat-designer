# Dependency Rules & Prohibited Patterns

Para manter o desacoplamento e a integridade determinística do Combat Designer, as seguintes regras de dependência são estritas e verificadas via CI:

---

## 1. Matriz de Dependências Permitidas

| Camada / Componente | Dependências Permitidas | Dependências Proibidas |
|---|---|---|
| Camada / Componente | Dependências Permitidas | Dependências Proibidas |
|---|---|---|
| **Domain** (`engine/src/domain`) | Nenhuma (Rust core, serde) | MCP, HTTP, Fastify, React, Neo4j, PostgreSQL, Docker, System Clock, floats para gameplay |
| **Simulator** (`engine/src/simulation`) | `domain`, serde, sha2, thiserror | System Clock (`Instant`, `SystemTime`), floats (`f32`, `f64`), MCP, HTTP, Neo4j, PostgreSQL, async runtimes |
| **Verification** (`engine/src/verification`) | `domain`, `simulation`, serde, sha2, thiserror | System Clock, floats, MCP, HTTP, Neo4j, PostgreSQL |
| **Backend Domain & Services** (`backend/src/modules/*`) | `backend/src/modules/*/domain`, Ports | Drivers concretos de Neo4j/Postgres, MCP SDK, React |
| **Backend Infrastructure Providers** (`backend/src/infrastructure/provider/*`) | Ports, Drivers de banco, Filesystem, Schemas | Regras de domínio de combate, MCP, React |
| **Backend HTTP** (`backend/src/infrastructure/http/*`) | Use cases, Health, Metrics, Node HTTP | Regras canônicas de domínio, MCP direct access |
| **MCP Server** (`mcp/server`) | `@combat-designer/backend`, MCP SDK | PostgreSQL direto, Neo4j direto, Cypher direto, autorização direta |
| **MCP Gateway** (`mcp/gateway`) | Policies, Audit, Limits, Token/Auth, `@combat-designer/backend` | Regras de combate, simulador, persistência canônica |

---

## 2. Invariantes de Isolamento do Rust Engine

1. **Determinismo Temporal**:
   * O tempo do simulador progride unicamente por ticks discretos de frames inteiros (`Frame: u32`).
   * Chamadas a `std::time::Instant`, `std::time::SystemTime` ou qualquer relógio de parede são expressamente proibidas.
2. **Determinismo Aritmético**:
   * Cálculos de dano, knockback, janelas de frames, posições e custos utilizam aritmética inteira (`i32`/`u32`/`permille`).
   * Ponto flutuante (`f32`/`f64`) é estritamente proibido para mecânica de combate.
3. **Desempate Determinístico**:
   * Qualquer colisão ou evento simultâneo deve possuir desempate estável baseado em tuplas ordinais `(actor_id, attack_id, sequence)`, sem iteradores não determinísticos.
