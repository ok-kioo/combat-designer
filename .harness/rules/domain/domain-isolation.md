# Regra — domain-isolation

## Camadas

```text
Domain
  -> Simulation
  -> Application
  -> MCP Server
  -> MCP Gateway
  -> Adapters/Infrastructure
```

## O domínio não pode importar

- Neo4j/PostgreSQL;
- MCP;
- MCP Gateway;
- LLM;
- HTTP;
- filesystem;
- Unity/Unreal/Godot;
- clock do sistema.

## Combat Domain

Contém Attack, Hitbox, Hurtbox, FrameWindow, CancelRule, HitReaction, ResourceCost, CombatState, Transition, Scenario e Archetype.

## Simulation

Conhece somente modelos e regras canônicas. Recebe frame, seed e estado inicial explicitamente.

## Ingestion

Somente descobre, extrai, normaliza e anexa provenance. Não decide balanceamento.

## Verification

Executa invariantes, ciclos, reachability, recursos, DPS, stun-lock e juggle limits.

## MCP Gateway

Fronteira de confiança. Autoriza, audita, isola workspaces, aplica policies, roteia. Não conhece o domínio de combate além do necessário para routing e capability check. Não decide se um combo é seguro.

## MCP Server

Define tools, schemas, resources, classificação de respostas, trust markings. Traduz MCP para commands/queries do Application. Não implementa autorização — recebe contexto já autorizado do Gateway.

## Application

Valida, orquestra, gerencia ChangeSet lifecycle, coordena domain/KG/simulator/gate/persistence. Única camada que pode persistir alterações em canonical state (após Gate quando aplicável).

## Boundary

Passagens entre camadas usam DTOs/commands/events versionados.

```text
Engine Asset
  -> RawExtraction
  -> CanonicalCombatModel
  -> Snapshot
  -> Simulation
```

```text
LLM / Agent
  -> MCP Gateway (auth, authz, workspace)
  -> MCP Server (tool dispatch, classify)
  -> Application (validate, orchestrate)
  -> Domain / Simulator / Gate
```

Nunca:

```text
AnimNotify -> Simulator
Neo4j Node -> Domain
LLM JSON -> DB write
MCP Tool -> Postgres direct write
MCP Tool -> Neo4j direct write
LLM -> Canonical state mutation
LLM -> Gate result alteration
```

sem mapper/validação/autorização.

## Trust boundary

```text
UNTRUSTED: LLM / Agent / MCP Client
    ↓
MCP Gateway (primeira fronteira de confiança)
    ↓
TRUSTED: Application / Domain / Simulator / Gate / Persistence
```

O LLM é tratado como untrusted caller. Nenhuma decisão de segurança depende da obediência do LLM ao prompt.

## Tempo

Nunca usar Date.now(), sleep ou relógio real para decidir gameplay. O resultado deve depender apenas de entrada explícita. Timestamps do Gateway (audit, rate limiting) não entram no cálculo determinístico.

## Enforcement

CI deve falhar em imports proibidos e em acesso direto de MCP/UI a persistência.
CI deve verificar que tools MCP não possuem imports diretos de Postgres/Neo4j.
CI deve verificar que o MCP Server não implementa lógica de autorização (responsabilidade do Gateway).
