# Skill — Architecture

## Objetivo

Manter o sistema modular, determinístico e substituível.

## Rust

Crates sugeridos:

```text
combat-domain
combat-simulation
combat-verification
combat-search
combat-wasm
```

Não importar MCP, HTTP, Cypher ou tipos de engine.

## TypeScript

Packages:

```text
mcp-gateway
mcp-server
application
ingestion
api
graph-adapter
postgres-adapter
ui
shared-contracts
```

### Package responsibilities

**`mcp-gateway`** — authentication, authorization, capability enforcement, tool policy, workspace isolation, request boundary validation, rate/execution limits, audit, correlation IDs, routing, deny-by-default. Não é microserviço no MVP — é package boundary dentro do monorepo.

**`mcp-server`** — definição das tools, schemas (Zod), resources, classificação de respostas (FACT/SIMULATION_RESULT/INFERENCE/SUGGESTION), trust markings, tradução MCP → application command/query. Não implementa autorização — recebe contexto autorizado do Gateway.

**`application`** — regras de aplicação, ChangeSet lifecycle, validação estrutural, coordenação entre domain/KG/simulator/gate/persistence, impedir mutações inválidas.

## Dados

PostgreSQL:
- revisions;
- snapshots;
- provenance;
- ChangeSets;
- gate runs;
- audit.

Neo4j:
- entidades;
- relações;
- traversals;
- dependências;
- exploração.

## API/MCP

Fluxo obrigatório:

```text
LLM
  ↓
MCP Gateway (auth, authz, capability, workspace, audit)
  ↓
MCP Server (tools, schemas, classify, trust)
  ↓
Application (validate, orchestrate)
  ↓
Domain / KG / Simulator / Gate
```

LLM usa commands:

```text
query_combat
propose_changeset
simulate_changeset
run_gate
impact_analysis
explain_gate
list_scenarios
withdraw_changeset
```

Nunca write direto. Nenhuma tool escreve Postgres ou Neo4j diretamente.

## Determinismo

Input:

```text
CombatModel + Scenario + InitialState + Seed + TickRate + MaxFrames + ExecutionBudget
```

Output:

```text
Trace + FinalState + Metrics + StateHash
```

## Deployment

Começar em monorepo + Docker Compose.

Extrair workers/serviços somente quando carga, isolamento de falhas ou ownership justificarem.

O MCP Gateway permanece como package boundary dentro do deployment até que extraction criteria justifiquem separação (docs/architecture/mcp-gateway.md §11).

## Princípio

O KG responde "o que está conectado"; o simulator responde "o que acontece"; o gate responde "é permitido"; o gateway responde "pode acessar".
