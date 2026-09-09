# Combat Designer Computational — Harness

## Decisão de stack

- **MCP:** TypeScript + MCP TypeScript SDK v2.
- **MCP Gateway:** TypeScript (package boundary dentro do monorepo; não microserviço).
- **Ingestão:** TypeScript/Node.js, com adapters independentes para Unity, Unreal e Godot.
- **Core de domínio, simulador e solver:** Rust.
- **Execução local:** Rust nativo + WebAssembly para ferramentas/browser.
- **Graph:** Neo4j/Cypher.
- **Auditoria e snapshots:** PostgreSQL.
- **API/orquestração:** TypeScript + Fastify.
- **UI:** React + Next.js.
- **Contratos:** JSON Schema + Zod.
- **Observabilidade:** OpenTelemetry.
- **Testes:** cargo test/proptest, Vitest, Playwright.
- **Local/dev:** Docker Compose; Kubernetes somente quando houver necessidade operacional.

O SDK TypeScript v2 do MCP é a linha estável documentada para a especificação de 2026; Neo4j é apropriado para consultas de caminhos/ciclos; Rust é o núcleo determinístico de alta confiabilidade; OpenTelemetry cobre traces, métricas e logs.

## Princípio

**LLM propõe. Gateway autoriza. Application valida. Simulator calcula. Mechanical Gate decide. Humano aprova.**

O LLM jamais pode ser a fonte de verdade de frame data ou de um PASS.

O MCP Gateway é a única fronteira de entrada MCP. Nenhum agente/LLM pode acessar diretamente banco, Neo4j, filesystem de projeto, simulator, canonical state ou mecanismos de aplicação de ChangeSet.

## Arquitetura

```text
LLM / Agent
        |
       MCP
        |
        v
  MCP Gateway (auth, authz, capability, policy, workspace, audit, routing)
        |
        v
  MCP Server (tools, resources, schemas, classify, trust)
        |
        v
  Application (validation, changeset lifecycle, orchestration)
        |
        v
Unity/Unreal/Godot
        |
        v
Engine Adapters -> Canonical Model -> Postgres snapshot
                                      |
                                      +-> Neo4j projection
                                      |
                                      v
                             Rust Simulation Core
                                      |
                                      v
                              Mechanical Gates
                                      ^
                                      |
               Application -----------+
```

Fluxo obrigatório:

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

## Estrutura e Source of Truth

O repositório adota separação estrita entre infraestrutura de agentes (`.agents/`), governança e documentação canônica (`.harness/`) e os módulos de produto:

```text
combat-designer-harness/
├── .agents/                                # Infraestrutura operacional de agentes (NÃO importável por runtime)
│   ├── manifests/harness-manifest.json     # Registro canônico de arquivos e integridade
│   ├── plans/                              # Planos de execução de agentes
│   ├── reports/                            # Relatórios e auditorias
│   ├── prompts/                            # Prompts canônicos de tarefas
│   ├── walkthroughs/                       # Guias e walkthroughs operacionais
│   ├── scripts/                            # Automações de agentes
│   ├── validators/fic/                     # CLI de validação do Feature Impact Contract (FIC)
│   └── templates/                          # Templates operacionais
├── .harness/                               # Governança Canônica e Source of Truth
│   ├── docs/                               # Documentação de arquitetura e FICs
│   │   ├── architecture/                   # Clean Architecture, Gateway, Simulator, KG
│   │   ├── feature-impacts/                # Registros de FIC validados (spec-00 a spec-04)
│   │   └── specifications/
│   ├── specs/                              # Especificações funcionais canônicas (00 a 09)
│   │   ├── 00-fic/spec.md
│   │   ├── 01-canonical-domain/spec.md
│   │   ├── 02-engine-ingestion/spec.md
│   │   ├── 03-knowledge-graph/spec.md
│   │   ├── 04-deterministic-simulator/spec.md
│   │   ├── 05-mechanical-gate/spec.md
│   │   └── ...
│   ├── rules/                              # Regras arquiteturais e invariantes inegociáveis
│   │   ├── architecture/
│   │   ├── domain/
│   │   ├── simulation/
│   │   ├── security/
│   │   ├── workspace/
│   │   ├── mcp/
│   │   └── testing/
│   └── skills/                             # Procedimentos operacionais padronizados
```

### Módulos do Produto

```text
combat-designer-harness/
├── engine/                                 # Rust deterministic core (zero float, frame clock, puro)
│   ├── combat-domain/                      # Entidades canônicas e invariantes estruturais
│   ├── combat-simulation/                  # Simulador de combate determinístico discreto
│   └── target/                             # Build artifacts Rust (gitignored; proibido no root)
├── backend/                                # Camada TypeScript de contratos e aplicação
│   ├── contracts/                          # DTOs, schemas Zod e tipos de fronteira
│   ├── application/                        # Orquestração de casos de uso e portas abstratas
│   └── infrastructure/                     # Adaptadores concretos
│       ├── ingestion/                      # Ingestão e normalização de bundles de engine
│       │   ├── exporters/unity/            # Scripts de exportação Unity
│       │   └── fixtures/unity-bundle/      # Bundles reais de engine para testes
│       └── neo4j/                          # Projeção e busca no Knowledge Graph
├── mcp/                                    # Protocolo Model Context Protocol
│   ├── gateway/                            # Fronteira de segurança, autenticação e policy
│   ├── server/                             # Definição e exposição de ferramentas MCP
│   └── tests/                              # Suíte de testes MCP
├── frontend/                               # Interface de usuário (React / Next.js)
├── shared/                                 # Artefatos genuinamente compartilhados
│   └── architecture/                       # Verificadores de fronteiras e integridade
├── Cargo.lock
├── Cargo.toml
├── package-lock.json
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

### Responsabilidades dos Módulos

**`engine/*`** — Núcleo puro em Rust. Implementa modelos canônicos e o simulador determinístico baseado em frame clock discreto e aritmética inteira. Proibido o uso de floats, relógio de parede do sistema (`std::time`), concorrência não determinística ou dependências de rede/banco. Build artifacts são gerados em `engine/target/` (nunca no root).

**`backend/contracts`** — Contratos de fronteira, schemas tipados (Zod) e serialização canônica. Não duplica lógica de física ou regras mecânicas de simulação.

**`backend/application`** — Orquestração de casos de uso, validação estrutural de intenções e gerenciamento de portas (`SimulationPort`, etc.). Desacoplado de drivers concretos.

**`backend/infrastructure/*`** — Adaptadores concretos (`neo4j`, `ingestion`). Conhecem drivers, formatos específicos de engines (Unity YAML), fixtures locais e bancos, mas não contêm regras canônicas de domínio.

**`mcp/gateway`** — Autenticação, autorização, isolamento rigoroso de workspace, enforcement de capabilities, rate limits e trilha de auditoria. Trata o LLM como chamador não confiável (*untrusted*).

**`mcp/server`** — Exposição de ferramentas MCP e mapeamento de chamadas para casos de uso da Application. Classificação semântica de respostas e marcação de confiança.

**`shared/architecture`** — Verificadores de integridade e regras de isolamento cross-cutting do monorepo. Não é código de runtime.

O backend nunca acessa o filesystem do usuário: a entrada chega como um Export Bundle via upload (.harness/specs/08-platform-delivery-and-tenant-model/spec.md). API/orquestração permanece TypeScript + Fastify + Zod — não Python — mesmo para as camadas de validação/segurança de upload (.harness/specs/09-ingestion-security-and-execution-limits/spec.md).

## Regra de evolução

Toda feature deve declarar impacto em domínio, contratos, KG, simulator, gates, MCP/API, gateway, authorization, capability, tool-policy, workspace, persistência, testes, auditoria e observabilidade.

## Fonte da verdade

A engine fornece os dados primários. O modelo canônico versionado é o contrato interno. PostgreSQL guarda snapshots/auditoria. Neo4j é uma projeção navegável.

## Tempo

Tempo de gameplay é inteiro em frames dentro do domínio. Conversões para segundos ficam nas bordas.

## Modos

- `STRICT`: falha fechada; usado em CI/release.
- `ADVISORY`: exploração; resultados nunca autorizam publicação.
- `EXPERIMENTAL`: pesquisa; não pode promover mudança diretamente.

## Tenant

Todo dado é escopado por `workspace_id` (.harness/specs/08-platform-delivery-and-tenant-model/spec.md). Query/tool call sem `workspace_id` explícito é erro de contrato, não uma consulta global implícita (.harness/specs/09-ingestion-security-and-execution-limits/spec.md). `workspace_id` enviado pelo cliente é declaração de intenção, não prova de autorização — o Gateway valida contra o conjunto autorizado do principal (.harness/docs/architecture/mcp-gateway.md).

## Segurança

O LLM é tratado como untrusted caller. Nenhuma decisão de segurança ou integridade depende de obediência do LLM ao prompt. Ver `.harness/rules/mcp/mcp-gateway-invariants.md` para as 17 invariantes de segurança e `.harness/docs/architecture/mcp-gateway.md` para o threat model completo.

StormMCP ou qualquer framework MCP externo pode ser usado como transporte/infra complementar, mas não substitui as garantias do Combat Designer (authorization, workspace isolation, gate integrity, changeset apply policy). Se a infra externa for removida, o domínio deve continuar funcionando.
