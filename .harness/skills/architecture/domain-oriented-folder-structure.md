# Skill — Domain-Oriented Folder Structure & Clean Architecture Layout

## Objetivo

Garantir que a organização física de pastas reflita fielmente os domínios de negócio e a hierarquia canônica de **Clean Architecture / Ports & Adapters (Arquitetura Hexagonal)**. Eliminar pastas utilitárias genéricas e pacotes técnicos dispersos no topo da hierarquia (`api`, `infra`, `utils`, `common`, `helpers`), assegurando que toda pasta nomeie uma capacidade de negócio ou uma camada formal de Clean Architecture com direção estrita de dependências (de fora para dentro).

Esta skill documenta a estrutura canônica definitiva estabelecida pela consolidação arquitetural do `backend/` e da `engine/`.

---

## Princípios e Regras Fundamentais

1. **Domínio sobre Técnica**: A raiz de qualquer subsistema organiza-se primariamente por domínios/capacidades de negócio (`combat`, `changeset`, `ingestion`, `simulation`, `verification`). Camadas técnicas (`infrastructure`, `provider`, `http`, `middleware`) existem para servir a esses domínios através de portas abstratas.
2. **Direção de Dependência (Outside-In)**:
   - **Regras de Negócio e Domínio** (`domain/entity`, `domain/repository`) são puras: zero dependências de bancos de dados, frameworks HTTP, drivers concretos ou relógios de sistema.
   - **Serviços de Aplicação / Casos de Uso** (`service/`) orquestram a lógica através de interfaces (portas) definidas na camada de domínio.
   - **Infraestrutura e Provedores** (`infrastructure/provider/`) implementam as portas de repositório e serviços externos. A infraestrutura depende do domínio; o domínio **nunca** depende da infraestrutura.
3. **Padrão de Camadas de Domínio (`src/modules/<domain>/`)**:
   - `<domain>/domain/entity/`: Entidades puras, types, value objects, schemas de domínio (Zod).
   - `<domain>/domain/repository/`: Portas abstratas / interfaces (ex.: `simulation-port.ts`, `mechanical-gate-port.ts`, `changeset-repository.ts`).
   - `<domain>/service/`: Casos de uso e serviços de aplicação (ex.: `verify-combat.ts`, `simulate-combat.ts`, `chat-orchestrator.ts`).
   - `<domain>/controller/`: Adaptadores primários HTTP / controllers de entrada que orquestram requisições daquele domínio.
4. **Isolamento de Drivers e Persistência**:
   - Código dentro de `src/modules/` **nunca** importa drivers concretos (`neo4j-driver`, `pg`, `postgres`, `mysql`, `sqlite3`, `typeorm`, `prisma`).
   - Persistência e consultas externas residem estritamente em `src/infrastructure/provider/`.
5. **Zero Scaffolding Fantasma**: Proibida a criação de pastas vazias ou scaffolding antecipado sem código real.
6. **Proibição de Links Simbólicos**: Zero symlinks arquiteturais no repositório.
7. **Isolamento do Harness / Runtime**: Código de produto de runtime (`backend`, `engine`, `frontend`, `mcp`, `shared`) **nunca** importa `.agents/` ou `.harness/`.
8. **Pacote de Governança Atômico**: Qualquer alteração de fronteira de pastas exige atualização conjunta de `shared/architecture/module-boundaries.test.ts`, documentação de arquitetura, FICs relevantes e suites de teste.

---

## 1. Raiz do Repositório

Apenas estes 7 módulos canônicos são permitidos na raiz do projeto (validado por `shared/architecture/module-boundaries.test.ts` - 17.1 / 27.1):

```text
combat-designer/
├── .agents/       # Governança de agentes, manifestos, templates e validadores FIC (nunca importado em runtime)
├── .harness/      # Especificações (specs), regras (rules), skills, FICs e documentação canônica
├── backend/       # Aplicação TypeScript consolidada (@combat-designer/backend)
├── engine/        # Crate nativa Rust pura e determinística (combat-engine)
├── frontend/      # Aplicação web e Workbench interativo Next.js/React (@combat-designer/frontend)
├── mcp/           # Model Context Protocol Gateway e Server (@combat-designer/mcp)
└── shared/        # Verificadores de fronteira arquitetural e testes de invariantes estruturais
```

Pastas proibidas na raiz (17.2 / 27.2): `packages`, `crates`, `infrastructure`, `scripts`, `tests`, `fixtures`, `exporters`, `target`, `data`, `docs`, `specs`, `rules`, `regras`, `skills`, `.docs`, `.specs`, `.rules`, `.skills`.

---

## 2. `backend/` — Pacote Consolidado `@combat-designer/backend`

O backend é unificado em um **único pacote npm** (`@combat-designer/backend`), eliminando a fragmentação de múltiplos `package.json` internos e centralizando o código estritamente sob `backend/src/`.

### 2.1 Estrutura de Diretórios

```text
backend/
├── package.json                          # @combat-designer/backend
├── tsconfig.json
├── Dockerfile
├── src/
│   ├── main.ts                           # Ponto de entrada / bootstrap do servidor
│   ├── routes/                           # Registro e mapeamento declarativo de rotas HTTP
│   │   └── index.ts
│   │
│   ├── modules/                          # Domínios de negócio segregados
│   │   ├── combat/                       # Domínio de combate e verificação mecânica
│   │   │   ├── controller/               # combat.controller.ts
│   │   │   ├── service/                  # verify-combat.ts, simulate-combat.ts
│   │   │   └── domain/
│   │   │       ├── entity/               # combat.types.ts, verification.types.ts
│   │   │       └── repository/           # simulation-port.ts, mechanical-gate-port.ts
│   │   ├── changeset/                    # Domínio de ChangeSets e auditoria
│   │   │   ├── controller/               # changeset.controller.ts
│   │   │   ├── service/                  # propose-changeset.ts, approve-changeset.ts, ...
│   │   │   └── domain/
│   │   │       ├── entity/               # changeset.types.ts
│   │   │       └── repository/           # changeset-repository.ts
│   │   ├── ingestion/                    # Domínio de ingestão de assets
│   │   │   └── domain/
│   │   │       └── entity/               # ingestion.types.ts, manifest.types.ts
│   │   ├── workspace/                    # Domínio de workspaces e isolamento multi-tenant
│   │   │   ├── service/                  # workspace.service.ts
│   │   │   └── domain/
│   │   │       ├── entity/               # workspace.types.ts
│   │   │       └── repository/           # workspace-repository.ts
│   │   ├── llm/                          # Orquestração de LLM e function calling
│   │   │   ├── service/                  # chat-orchestrator.ts, combat-tool-declarations.ts
│   │   │   └── domain/
│   │   │       └── port/                 # llm-provider.ts (porta abstrata)
│   │   ├── fic/                          # Validação e auditoria de Feature Impact Contracts
│   │   │   ├── service/                  # fic.service.ts
│   │   │   └── domain/
│   │   │       └── entity/               # fic.types.ts, validator.ts
│   │   ├── observability/                # Domínio de telemetria e integridade operacional
│   │   │   ├── service/                  # telemetry.service.ts
│   │   │   └── domain/
│   │   │       ├── entity/               # telemetry.types.ts
│   │   │       └── repository/           # telemetry-port.ts
│   │   └── mcp/                          # Contratos e tipos compartilhados com MCP
│   │       └── domain/
│   │           └── entity/               # mcp.types.ts
│   │
│   └── infrastructure/                   # Camada técnica e adaptadores concretos
│       ├── http/                         # Servidor HTTP (node:http), workbench-html, CORS
│       │   ├── server.ts
│       │   └── workbench-html.ts
│       ├── middleware/                   # Middlewares (auth, tenant isolation, rate limit, error)
│       │   ├── auth.middleware.ts
│       │   ├── error.middleware.ts
│       │   └── workspace.middleware.ts
│       └── provider/                     # Adaptadores concretos das portas de domínio
│           ├── ingestion/                # Pipeline de ingestão, normalizer, cache, limits
│           │   ├── pipeline.ts
│           │   ├── normalizer.ts
│           │   ├── version-check.ts
│           │   ├── limits.ts
│           │   ├── envelope.ts
│           │   ├── cache.ts
│           │   ├── parsers/              # Parsers específicos (Unity, Unreal, Godot)
│           │   ├── exporters/            # Scripts de exportação entregues às engines
│           │   └── fixtures/             # Bundles de teste e validação
│           ├── knowledge-graph/          # Adaptador Neo4j (@combat-designer/graph-adapter)
│           │   ├── client/               # Conexão e driver Neo4j isolado
│           │   ├── projector/            # Projeção canônica em grafo
│           │   ├── queries/              # Consultas Cypher
│           │   ├── schema/               # Índices e constraints
│           │   └── adapter.ts
│           ├── llm/                      # Adaptadores concretos de LLM
│           │   └── gemini-provider.ts    # Implementação via @google/genai SDK
│           └── observability/            # Adaptadores de métricas, tracing e logging
│               ├── otel/                 # OpenTelemetry SDK
│               ├── metrics/              # Métricas Prometheus
│               ├── tracing/              # Traces OTLP
│               ├── logging/              # Pino logger estruturado
│               ├── health/               # Probes de liveness e readiness
│               ├── dashboards/           # Definições JSON de dashboards Grafana
│               └── grafana/              # Provisionamento Grafana
└── tests/
    ├── unit/                             # Testes unitários por camada de domínio
    ├── integration/                      # Testes de integração de API, ingestão e grafo
    └── fixtures/                         # Cargas estáticas de teste
```

### 2.2 Regras Estritas de Dependência do Backend
- `src/modules/*/domain` tem **zero** imports de `src/infrastructure` ou de pacotes de banco/driver.
- `src/modules/*/service` depende apenas de `src/modules/*/domain`.
- `src/infrastructure/provider/*` implementa as interfaces definidas em `src/modules/*/domain/repository`.
- `src/infrastructure/http/server.ts` recebe implementações de portas via injeção de dependência na inicialização.

---

## 3. `engine/` — Crate Única Nativa Rust `combat-engine`

A engine foi consolidada em uma **única crate Rust** (`combat-engine` em `engine/Cargo.toml`), eliminando a fragmentação de crates dispersas e subpastas `src/` redundantes. Todo o código reside sob `engine/src/`, estruturado em três submódulos estritamente isolados:

### 3.1 Estrutura de Diretórios

```text
engine/
├── Cargo.toml                            # [package] name = "combat-engine"
├── Dockerfile
├── src/
│   ├── lib.rs                            # Exportação pública dos módulos: domain, simulation, verification
│   │
│   ├── domain/                           # Núcleo Canônico Puro (Canonical Domain Model)
│   │   ├── mod.rs
│   │   ├── attack.rs                     # Entidade Attack, dados de frame e hitboxes
│   │   ├── hitbox.rs                     # Formas geométricas discretas e damage specs
│   │   ├── frame.rs                      # Janelas temporais em inteiros (FrameWindow)
│   │   ├── cancel.rs                     # Regras de cancelamento (CancelRule, CancelCondition)
│   │   ├── resource.rs                   # Custos e geração de recursos (ResourceCost)
│   │   ├── state.rs                      # Estados do ator (CombatState, StunType)
│   │   ├── archetype.rs                  # Arquétipos de personagens
│   │   ├── identity.rs                   # AttackId, CharacterId, WorkspaceId
│   │   ├── provenance.rs                 # Rastreabilidade de origem de dados (Provenance)
│   │   ├── trust.rs                      # Níveis de confiança (Untrusted, Verified, etc.)
│   │   └── error.rs                      # Erros de invariantes de domínio (DomainError)
│   │
│   ├── simulation/                       # Simulador Determinístico Temporal ("WHAT HAPPENS?")
│   │   ├── mod.rs
│   │   ├── engine.rs                     # CombatSimulator — loop temporal determinístico
│   │   ├── clock.rs                      # FrameClock discreto monotônico (u32/u64)
│   │   ├── budget.rs                     # ExecutionBudget & BudgetTracker (limites de frames/eventos)
│   │   ├── events.rs                     # EventLog ordenado determinístico (SimulationEvent)
│   │   ├── metrics.rs                    # Métricas mecânicas computadas (DPS, burst, juggle)
│   │   ├── replay.rs                     # Execução e validação de replays idênticos
│   │   ├── order.rs                      # Resolução determinística de empates e prioridades
│   │   ├── sha256.rs                     # Cálculo canônico de StateHash
│   │   ├── snapshot.rs                   # Snapshots intermediários do estado de combate
│   │   └── model.rs                      # DTOs de entrada e saída de simulação
│   │
│   ├── verification/                     # Mechanical Gate ("IS IT MECHANICALLY SAFE?")
│   │   ├── mod.rs
│   │   ├── verifier.rs                   # MechanicalVerifier::verify
│   │   ├── profile.rs                    # Perfis: strict, fast, research
│   │   ├── verdict.rs                    # GateVerdict: Pass, Fail, Blocked, Stale, BudgetExceeded, Error
│   │   ├── budget.rs                     # VerificationBudgetTracker (proteção contra explosão combinatória)
│   │   ├── violations.rs                 # ViolationCode e ViolationSeverity
│   │   ├── evidence.rs                   # EvidenceRecord com ordenação canônica determinística
│   │   ├── stale.rs                      # StaleProtection — validação da 7-tupla canônica
│   │   ├── hash.rs                       # gate_result_hash canônico SHA-256
│   │   └── rules/                        # Implementação das regras G01–G11 e Counterplay
│   │       ├── mod.rs
│   │       ├── simulation_integrity.rs   # G01: integridade e StateHash
│   │       ├── infinite_loop.rs          # G02: detecção de ciclos infinitos
│   │       ├── stun_lock.rs              # G03: janela de reação mínima contra stun-lock
│   │       ├── resource_safety.rs        # G04: consumo e regeneração de recursos
│   │       ├── max_sustained_dps.rs      # G05: janela deslizante de DPS (60fps normalizado)
│   │       ├── max_burst.rs              # G06: teto de dano contíguo imediato
│   │       ├── max_juggle.rs             # G07: teto de tempo contínuo airborne/juggle
│   │       ├── cancel_validity.rs        # G08: execução estrita dentro da janela de cancel
│   │       ├── provenance_required.rs    # G09: exigência de proveniência verificável
│   │       ├── zero_risk_attack.rs       # G10: ataque invulnerável sem recuperação
│   │       ├── guard_integrity.rs        # G11: opções de escape antes da quebra de guarda
│   │       └── counterplay.rs            # Regra de contra-ataque acionável
│   │
│   └── bin/
│       └── server.rs                     # Servidor nativo da engine (comunicação TCP/HTTP)
└── tests/                                # Suíte completa de testes de isolamento e propriedades
    ├── domain_invariant_tests.rs
    ├── domain_property_tests.rs
    ├── domain_determinism_tests.rs
    ├── domain_cross_engine_equivalence_tests.rs
    ├── domain_architecture_isolation_test.rs
    ├── simulation_tests.rs
    ├── simulation_property_tests.rs
    ├── simulation_budget_tests.rs
    ├── simulation_determinism_tests.rs
    ├── simulation_architecture_isolation_test.rs
    ├── verification_verifier_tests.rs
    ├── verification_property_tests.rs
    ├── verification_security_tests.rs
    └── verification_architecture_isolation_test.rs
```

### 3.2 Invariantes Arquiteturais da Engine
- **Hierarquia Interna**:
  - `domain` tem **zero** dependências de `simulation` e `verification`.
  - `simulation` depende apenas de `domain`.
  - `verification` avalia os fatos gerados por `simulation` contra os invariantes de `domain`.
- **Pureza Numérica Discreta**: Proibido o uso de números de ponto flutuante (`f32`, `f64`) na lógica mecânica de física, colisão, dano, frames ou verificação. Todos os cálculos usam estritamente inteiros (`u32`, `u64`, `i32`).
- **Zero Wall-Clock**: Proibido o uso de `std::time::{Instant, SystemTime}`. O tempo temporal é governado exclusivamente pelo `FrameClock` discreto.
- **Isolamento de Dependências**: O `Cargo.toml` da engine não pode depender de `tokio`, `neo4j`, `postgres`, frameworks web ou pacotes de observabilidade de terceiros.

---

## 4. `frontend/` — Arquitetura Orientada a Features (Feature-Sliced)

O frontend adota organização por capacidades/features de produto, eliminando o anti-padrão de pastas técnicas horizontais no nível de raiz (`hooks/`, `services/`, `state/` soltos na raiz):

```text
frontend/
├── app/                                  # Roteamento e layout (Next.js App Router)
│   ├── page.ts                           # Ponto de composição de features
│   └── server.ts                         # Servidor HTTP de entrega do frontend
├── features/                             # Domínios de interface do usuário
│   ├── combat-explorer/                  # Exploração e visualização de ataques/cancels
│   │   ├── components/                   # CombatExplorer.ts, HitboxViewer, FrameTimeline
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── state/
│   │   └── types/
│   ├── changeset-review/                 # Revisão e aprovação de ChangeSets com Gate verdicts
│   │   ├── components/                   # ChangeSetReview.ts, VerdictBadge, DiffViewer
│   │   └── types/
│   ├── director-chat/                    # Painel de conversação do Combat Director com LLM
│   │   ├── components/                   # DirectorChat.ts, ToolCallHistory, PromptEnvelope
│   │   └── types/
│   ├── simulation-workbench/             # Bancada de simulação interativa e execução
│   │   ├── components/                   # SimulationWorkbench.ts
│   │   └── types/
│   └── catalog/                          # Catálogo de ataques e cenários do workspace
│       ├── components/                   # CatalogList.ts
│       └── types/
├── shared/                               # Componentes e serviços reusados por 2+ features
│   └── services/                         # api-client.ts (comunicação REST tipada com backend)
└── tests/                                # Testes de renderização e lógica de frontend
```

**Regras do Frontend**:
- Proibido importar drivers de banco de dados (`pg`, `neo4j-driver`).
- Proibido importar infraestrutura de observabilidade (`@opentelemetry`, `prometheus`, etc.).
- Proibido importar módulos internos do Rust (`CombatSimulator`, `MechanicalVerifier`).
- Comunicação com o backend é realizada exclusivamente através do `api-client.ts` via HTTP/REST.

---

## 5. `mcp/` — Model Context Protocol Gateway & Server

O subsistema MCP separa estritamente a fronteira de autorização da exposição de ferramentas:

```text
mcp/
├── package.json                          # @combat-designer/mcp
├── gateway/                              # Fronteira de Segurança e Autorização ("CAN I?")
│   └── src/
│       ├── auth/                         # Resolução de principal, validação de tokens
│       ├── policy/                       # Políticas de acesso e restrições por role
│       ├── workspace/                    # Isolamento e autorização estrita de workspace
│       ├── routing/                      # Roteamento de tool calls seguras
│       └── audit/                        # Registro de auditoria de chamadas MCP
└── server/                               # Servidor de Ferramentas e Tradução ("TRANSLATE")
    └── src/
        ├── main.ts                       # Ponto de entrada HTTP/SSE do servidor MCP
        ├── tools/                        # Schemas e definições formais das ferramentas
        ├── handlers/                     # Manipuladores de ferramentas (delegação ao backend)
        └── orchestration/                # Orquestração e envelope de contexto
```

**Regras do MCP**:
- O Gateway nunca contém regras mecânicas de combate nem simulação física.
- O Server nunca escreve diretamente em bancos de dados nem altera assets; delega chamadas via HTTP/portas ao backend.
- O MCP nunca importa ou depende do `frontend/`.

---

## 6. `shared/` — Fronteiras e Invariantes Cross-Cutting

O diretório `shared/` abriga exclusivamente código e testes de verificação arquitetural que inspecionam o repositório como um todo:

```text
shared/
└── architecture/
    └── module-boundaries.test.ts        # Suite formal de 16 testes de integridade estrutural
```

---

## Checklist de Conformidade Arquitetural (Spec Compliance Gate)

Antes de considerar concluída qualquer alteração de código ou documentação, verifique:

- [ ] **Raiz Limpa**: Apenas os 7 diretórios canônicos existem na raiz do projeto (`.agents`, `.harness`, `backend`, `engine`, `frontend`, `mcp`, `shared`).
- [ ] **Localização no Backend**: Todo novo arquivo do backend reside sob `backend/src/modules/<domain>/` ou `backend/src/infrastructure/`.
- [ ] **Pureza do Domínio do Backend**: Nenhum arquivo em `backend/src/modules/` importa drivers concretos (`neo4j-driver`, `pg`, etc.).
- [ ] **Localização na Engine**: Todo novo arquivo da engine reside sob `engine/src/domain/`, `engine/src/simulation/` ou `engine/src/verification/`.
- [ ] **Pureza Mecânica da Engine**: Zero números de ponto flutuante (`f32`/`f64`) e zero relógio de parede (`Instant`/`SystemTime`) na lógica mecânica.
- [ ] **Isolamento de Runtime**: Nenhum código de produto importa `.agents/` ou `.harness/`.
- [ ] **Testes de Arquitetura Verificados**: O comando `vitest run shared/architecture/module-boundaries.test.ts` passa com 100% de sucesso.
- [ ] **Rastreabilidade FIC**: Toda adição ou mudança de fronteira possui FIC correspondente e validado via `npm run validate-fic`.