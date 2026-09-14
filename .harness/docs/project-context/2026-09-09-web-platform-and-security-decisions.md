# Historical Project Decision Record — Web Platform and Security

> **Project-specific, non-reusable record.** This file preserves the concrete decisions that were previously embedded in a reusable Rule artifact. It is retained for traceability and project continuity. Current project specifications are authoritative when they supersede any historical wording below.

# Proposta — Plataforma Web, Modelo de Ingestão por Upload e Segurança do Gateway

Avaliação de uma sugestão externa (2026-09-09) contra o harness atual, seguindo o ciclo de
`regras/suggest-improvements.md`: `SUGGESTED -> ACCEPTED | DEFERRED | REJECTED`.

Cada item abaixo segue o formato obrigatório da regra. Itens `ACCEPTED`/`ADAPTED` geram spec
própria (specs/08 e specs/09, e amendments em 02/04/05/06/07). Nenhum item foi aplicado
silenciosamente; nenhum PASS foi declarado; nenhum gate foi removido.

---

## Item 1 — Interface como SaaS web + script de exportação (sem plugin de engine)

```yaml
title: Ingestão via bundle exportado (script leve) em vez de acesso direto ao project root
priority: P1
problem: >
  Spec 02 descreve o pipeline discovery -> classification -> parser -> ...
  partindo de "project root", o que sugere acesso direto ao filesystem do projeto da engine.
  Isso implica plugin/agente rodando dentro da engine do usuário ou acesso de rede ao
  ambiente dele — superfície de ataque maior, mais fricção de instalação, dependência de
  versão de engine.
evidence: specs/02-engine-ingestion.md ("project root -> discovery"); nenhum spec define
  como os bytes chegam ao backend.
proposed_change: >
  Formalizar um "Export Bundle": script de exportação (.cs/.py) rodado pelo usuário dentro
  da engine, que executa localmente as fases discovery+classification+parser client-side
  e produz um pacote versionado (manifest + CanonicalCombatModel parcial ou RawExtraction).
  O usuário faz upload desse bundle no app web. O backend nunca acessa o filesystem do
  usuário diretamente.
affected_domains: [ingestion, api, ui, contracts]
risk: >
  Se o script de exportação divergir da versão do parser server-side, snapshot pode ficar
  inconsistente. Mitigado exigindo parser_version/exporter_version no manifest do bundle
  (ver specs/08).
test_needed: contract test do formato do bundle; fixture de bundle desatualizado (exporter
  antigo) => QUARANTINED/CONFLICT, nunca aceito silenciosamente.
migration_needed: não (feature nova, specs/02 só ganha uma seção de "Modelo de Entrega").
can_be_deferred: não — é pré-requisito para qualquer superfície multiusuário.
status: ACCEPTED — spec nova specs/08-platform-delivery-and-tenant-model.md; specs/02 recebe
  seção "Modelo de Entrega" explicando que "project root" citado ali é o root local de onde o
  exporter lê, não um root acessado remotamente pelo backend.
```

## Item 2 — Backend em Python/FastAPI

```yaml
title: API/Gateway em Python (FastAPI)
priority: P2
problem: >
  README.md já fixa a stack: "API/orquestração: TypeScript + Fastify", com MCP também em
  TypeScript SDK v2. Introduzir Python nesse ponto duplica runtime, duplica validação de
  contrato (Zod já cobre isso em TS) e quebra skills/architecture.md, que define os packages
  do monorepo TypeScript (mcp-server, application, ingestion, api, ...) sem prever um serviço
  Python.
evidence: README.md ("Decisão de stack"); skills/architecture.md (packages TypeScript).
proposed_change: >
  Não introduzir Python. As mesmas garantias pedidas (limite de upload, streaming parser,
  validação estrita de schema, timeout de execução) são replicadas na stack já decidida:
  Fastify com limite de body configurado, um streaming JSON parser em Node
  (ex.: incremental parse com profundidade/tamanho máximo antes de materializar objeto),
  e Zod para o "envelope" do bundle. A validação por-campo de Pydantic descrita na sugestão
  vira validação Zod equivalente em specs/09.
affected_domains: [api, contracts]
risk: nenhum risco novo; risco evitado é o de duas stacks de validação divergentes.
test_needed: n/a (decisão de não-mudança)
migration_needed: não
can_be_deferred: n/a
status: REJECTED (adaptado) — mantém TypeScript+Fastify+Zod já decidido; a intenção de
  segurança da sugestão foi absorvida em specs/09 sem trocar de runtime.
```

## Item 3 — Prevenção de JSON bomb / DoS no upload

```yaml
title: Limite de tamanho e parsing em streaming para bundles enviados
priority: P0
problem: Nenhum spec define limite de tamanho de upload nem comportamento diante de um
  bundle profundamente aninhado ou muito grande.
evidence: specs/02-engine-ingestion.md não trata tamanho/DoS; specs/09 (novo) preenche isso.
proposed_change: >
  Limite rígido de tamanho por bundle (configurável, default sugerido 5MB por asset/10MB por
  bundle comprimido) aplicado antes de qualquer parse completo; parser de envelope deve
  abortar por profundidade/tamanho antes de materializar a árvore inteira em memória.
affected_domains: [ingestion, api, observability]
risk: baixo; falso-positivo em bundles legítimos muito grandes — mitigado permitindo
  bundles multi-arquivo (por Character/Attack) em vez de exigir um único JSON monolítico.
test_needed: fixture de bundle acima do limite => rejeitado no envelope, nunca truncado
  silenciosamente; fixture de aninhamento excessivo => abortado com razão.
migration_needed: não
can_be_deferred: não — item P0 de segurança básica antes de abrir upload multiusuário.
status: ACCEPTED — specs/09.
```

## Item 4 — Validação estrita de schema do bundle

```yaml
title: Validação de envelope (Zod) antes de entrar no pipeline de parser por asset
priority: P0
problem: >
  Spec 02 já define comportamento para asset individual malformado (QUARANTINED), o que é
  mais robusto que "rejeitar o upload inteiro no primeiro campo errado" — preserva os assets
  válidos do mesmo bundle. Mas não existe validação do envelope do bundle em si (manifest,
  versionamento, estrutura de top-level) antes de começar a iterar assets.
evidence: specs/02-engine-ingestion.md ("Falha de parse" já cobre nível de asset).
proposed_change: >
  Duas camadas de validação, não uma: (1) envelope-level — manifest do bundle (exporter_version,
  engine, project_id, lista de assets, checksums) validado com Zod; falha aqui rejeita o upload
  inteiro com erro claro por campo, pois sem manifest válido não há como isolar assets; (2)
  asset-level — comportamento já existente em specs/02 (QUARANTINED por asset, nunca
  default silencioso). Não substituir QUARANTINED por rejeição total.
affected_domains: [ingestion, contracts]
risk: nenhum; reforça o que já existe.
test_needed: manifest inválido => upload inteiro rejeitado com path do campo; asset inválido
  dentro de manifest válido => QUARANTINED, resto do bundle processado.
migration_needed: não
can_be_deferred: não
status: ACCEPTED (adaptado) — specs/09, preservando o comportamento de QUARANTINED já
  definido em specs/02 em vez de substituí-lo.
```

## Item 5 — Proteção contra prompt injection indireta via nomes/strings de asset

```yaml
title: Sanitização na ingestão + reforço da barreira já existente no MCP
priority: P0
problem: >
  A sugestão propõe regex de sanitização de nomes e delimitação de dados no prompt como
  única defesa. Mas specs/06-mcp-llm-orchestration.md já define uma defesa mais forte:
  texto de asset é `untrusted_text: true` e uma proposta consultiva não pode ser criada
  com base só em texto sem correspondência em dado estruturado do canonical model. Regex de
  nome sozinho seria uma defesa mais fraca e redundante se tratada como a solução principal.
evidence: specs/06-mcp-llm-orchestration.md, seção "Segurança".
proposed_change: >
  Manter specs/06 como a defesa primária (arquitetural: LLM nunca decide status de análise e nunca
  cria proposta baseada só em texto não confiável). Adicionar, na ingestão (specs/01/09),
  uma camada extra e independente: normalizar/validar `name` de Attack/Hitbox/etc. contra um
  charset restrito (letras, números, underscore, espaço) no momento do parse, e persistir a
  string original bruta separadamente como `raw_label` com `untrusted_text: true` para
  exibição, nunca para lógica. Isso é defesa em profundidade, não substituto do que já existe.
affected_domains: [ingestion, mcp, contracts]
risk: baixo; risco de falso-positivo em nomes com acentuação/caracteres válidos de outros
  idiomas — mitigado permitindo Unicode de letras (categoria L) em vez de só ASCII.
test_needed: fixture com nome contendo instrução ("ignore instru\u00e7\u00f5es anteriores...")
  => normalizado/rotulado untrusted_text, nunca interpretado; fixture com nome acentuado
  válido (pt-BR) => aceito.
migration_needed: não
can_be_deferred: não
status: ACCEPTED (adaptado) — specs/09 complementa specs/06, não o substitui.
```

## Item 6 — Isolamento de tenant/workspace

```yaml
title: Escopo obrigatório de workspace em toda query Cypher/SQL e em toda tool MCP
priority: P0
problem: >
  Nenhum spec atual define um identificador de tenant/workspace propagado por todas as
  camadas. specs/06 menciona "auth scope" para novas tools MCP, mas não define o que esse
  escopo contém.
evidence: specs/03-knowledge-graph.md e specs/06 não citam workspace_id/tenant_id.
proposed_change: >
  `workspace_id` como campo obrigatório em Project (specs/01), propagado para Revision,
  Snapshot, todo nó Neo4j via `graph_schema_version`-scoped label ou property indexada, toda
  linha Postgres, e como claim obrigatório em toda chamada MCP (`auth scope` de specs/06
  passa a significar, no mínimo, workspace_id). Query sem workspace_id explícito é erro de
  contrato, não uma query "global" por omissão.
affected_domains: [domain, kg, persistence, mcp, api]
risk: médio — é uma mudança de contrato transversal; deve ser feita antes de existir dado
  real de múltiplos usuários, não depois.
test_needed: teste de isolamento — query/tool com workspace_id A nunca retorna nó/linha de
  workspace_id B, mesmo com id de asset colidente entre workspaces.
migration_needed: sim — postgres_migrations e neo4j_migrations (workspace_id em todas as
  tabelas/nós relevantes).
can_be_deferred: não — inviável adicionar depois com segurança sobre dado já existente.
status: ACCEPTED — specs/09.
```

## Item 7 — Timeout/fuel rígido no simulador e no solver

```yaml
title: Orçamento de execução (tempo e iterações) para simulação e busca de combos
priority: P0
problem: >
  specs/04-deterministic-simulator.md define MaxFrames como input, mas não define um limite
  de tempo real de execução nem de "fuel" para buscas (combo discovery, otimização de
  parâmetros) que podem ter espaço de busca combinatório, como o próprio harness já
  reconhece em specs/03 ("Consultas essenciais" inclui ciclos de ações).
evidence: specs/04-deterministic-simulator.md (sem seção de orçamento); specs/05 não tem um
  estado que represente esgotamento de orçamento distinto de ERROR genérico.
proposed_change: >
  Adicionar a specs/04 um "Orçamento de Execução" (wall-clock timeout + max_iterations/"fuel")
  como parte do input de toda chamada de simulação/busca, com resultado explícito
  `BUDGET_EXCEEDED` (não um ERROR genérico, para diferenciar bug de espaço de busca grande).
  specs/05 passa a tratar `BUDGET_EXCEEDED` como não-PASS, distinto de FAIL: significa
  "não decidido", não "viola regra".
affected_domains: [simulation, gates, mcp]
risk: baixo; risco de search legítima ser cortada — mitigado por specs/06 já poder devolver
  ao LLM uma mensagem para refinar constraints, como a sugestão original propôs.
test_needed: fixture com espaço de busca deliberadamente grande => BUDGET_EXCEEDED, nunca
  interpretado como PASS ou FAIL.
migration_needed: não
can_be_deferred: não
status: ACCEPTED — amendments em specs/04 e specs/05, referenciadas em specs/09.
```

## Item 8 — UI dividida em painel de projeto + chat

```yaml
title: Combat Explorer com painel de projeto (esquerda) e Diretor de Combate (direita)
priority: P3
problem: specs/07 já lista as telas MVP mas não descreve o layout ou a relação entre
  upload/status e o chat.
evidence: specs/07-dashboard-and-observability.md, seção "Telas MVP".
proposed_change: painel esquerdo (upload de bundle, status de ingestão, snapshot/revision
  atual, histórico de simulações) e painel direito (chat MCP/LLM), ambos lendo do mesmo
  workspace_id.
affected_domains: [ui]
risk: nenhum; é descrição de layout, não de lógica de domínio.
test_needed: n/a (specs/07 não exige testes de layout, só de fluxo ponta-a-ponta)
migration_needed: não
can_be_deferred: sim, mas de baixo custo incluir agora.
status: ACCEPTED — amendment em specs/07.
```

---

## Resumo de decisões

| Item | Status |
|---|---|
| 1. Bundle exportado (sem acesso direto a project root) | ACCEPTED — specs/08 |
| 2. Backend em Python/FastAPI | REJECTED — mantém TS+Fastify+Zod |
| 3. Limite de tamanho / streaming parser | ACCEPTED — specs/09 |
| 4. Validação de envelope vs. QUARANTINED por asset | ACCEPTED (adaptado) — specs/09 |
| 5. Sanitização de nomes + reforço de untrusted_text | ACCEPTED (adaptado) — specs/09 |
| 6. Isolamento de workspace/tenant | ACCEPTED — specs/09 |
| 7. Orçamento de execução (timeout/fuel) | ACCEPTED — specs/04, specs/05 |
| 8. UI painel + chat | ACCEPTED — specs/07 |
