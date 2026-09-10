# Spec 08 — Platform Delivery and Tenant Model

Origem: `regras/propostas/2026-09-09-web-platform-and-security.md`, itens 1 e 8 (ACCEPTED).

## Princípio

O backend nunca acessa o filesystem ou a engine do usuário diretamente. Toda entrada chega
como um **Export Bundle** enviado por upload. Isso não muda o pipeline de specs/02
(discovery -> classification -> parser -> normalization -> validation -> provenance ->
snapshot); muda apenas onde e por quem as duas primeiras fases rodam.

## Export Bundle

Produzido localmente por um script leve de exportação (`.cs` para Unity, `.py`/plugin
equivalente para Unreal/Godot) executado dentro da engine do usuário. O script:

1. varre os assets de combate do projeto (fase `discovery` + `classification` local);
2. serializa em `RawExtraction` por asset (specs/02), sem tentar normalizar para
   `CanonicalCombatModel` — normalização continua sendo responsabilidade do backend;
3. empacota tudo com um manifest.

```text
export-bundle/
  manifest.json
  assets/
    <asset_id>.json  (um RawExtraction por asset)
```

### manifest.json (obrigatório)

```text
exporter_version
engine            (unity|unreal|godot)
engine_version
project_id
project_revision_label
generated_at
asset_count
checksums: { <asset_id>: sha256 }
```

O manifest é a fronteira de confiança do upload. Ver specs/09 para validação de envelope.

## Fluxo de upload

```text
Engine (script de exportação)
  -> Export Bundle (zip)
  -> upload no app web
  -> validação de envelope (specs/09)
  -> pipeline de specs/02 (classification/parser/normalization/validation/provenance/snapshot)
  -> Postgres snapshot -> Neo4j projection
```

Não existe modo em que o backend inicia conexão de volta para a máquina do usuário, nem
plugin com socket aberto. Isso elimina a superfície de firewall/CORS/porta descrita na
proposta original e mantém o `domain-isolation.md` intacto (ingestion continua sem acesso a
filesystem de terceiros — o bundle já chega como bytes no boundary do backend).

## Divergência exporter x parser

`exporter_version` no manifest é comparado contra a faixa de versões suportada pelo parser
server-side (specs/02, regra de `parser_version`). Fora da faixa suportada:
`CONFLICT` no relatório de ingestão — nunca aceito silenciosamente, nunca convertido "na
melhor tentativa".

## Workspace / Tenant

Todo Export Bundle é enviado dentro do contexto de um `workspace_id` explícito (um projeto
do usuário no app). `workspace_id` é obrigatório em:

- `Project` no canonical model (specs/01);
- toda tabela Postgres derivada de Project/Revision/Snapshot/ChangeSet/GateResult;
- toda propriedade indexada em nós Neo4j projetados a partir desse Project;
- todo tool call MCP (parte do auth scope citado em specs/06).

Ver specs/09 para as regras de enforcement e teste de isolamento.

## Workspace Authorization

`workspace_id` enviado pelo cliente (seja via MCP tool call ou via upload no painel web)
é uma **declaração de intenção/contexto**, não uma prova de autorização.

Para chamadas MCP, o MCP Gateway valida `workspace_id` contra o conjunto de workspaces
autorizados para o principal autenticado (docs/architecture/mcp-gateway.md §7).

Para uploads via API/painel web, o Application Layer realiza a mesma validação antes de
iniciar o pipeline de ingestão (specs/02).

A validação de workspace é enforced em todas as camadas:

```text
MCP Gateway (para chamadas MCP)
API Layer (para uploads e HTTP)
Application Layer
Postgres (row-level filtering por workspace_id)
Neo4j (property-level filtering por workspace_id)
```

Upload de bundle **não** passa pelo MCP Gateway (é uma operação HTTP via painel/API, não
uma tool call MCP). O MCP Gateway é fronteira exclusiva para o protocolo MCP.

## UI — Combat Explorer (amendment a specs/07)

Layout de duas colunas, ambas escopadas ao `workspace_id` ativo:

- **Esquerda — Painel do Projeto**: upload de Export Bundle, status de ingestão (assets
  processados/quarantined/conflict), revision/snapshot atual, histórico de GateResults e
  simulações.
- **Direita — Diretor de Combate**: chat MCP/LLM (specs/06, specs/13).

Nenhuma ação no painel esquerdo escreve diretamente em canonical data — upload dispara o
pipeline de specs/02, que segue as mesmas regras de QUARANTINED/CONFLICT/provenance já
definidas.

### Integração com SPEC 12 e SPEC 13 (User Projects & Conversation Isolation)
- Conforme a SPEC 12, workspaces representam projetos de combate pertencentes a usuários individuais (`User 1 ─── N Workspace`).
- Conforme a SPEC 13, o chat do Combat Director opera estritamente sob isolamento contextual identificado por `(user_id, workspace_id, conversation_id)`, impedindo qualquer vazamento cruzado entre projetos ou conversações.


## Feature Impact Contract

```yaml
feature_id: platform-delivery-001
title: Export Bundle + workspace model
status: designed
domain_owner: ingestion
contracts:
  - name: export-bundle-manifest
    version: v1
    change: additive
data_sources: [export-bundle-upload]
kg:
  nodes_changed: [Project]
  relationships_added: []
simulation:
  states_added: []
persistence:
  postgres_migrations: [add workspace_id to Project/Revision/Snapshot/ChangeSet/GateResult]
  neo4j_migrations: [add workspace_id property + index to projected nodes]
tests:
  integration: [bundle upload happy path, exporter_version fora de faixa => CONFLICT]
  fixtures: [bundle multi-asset com um asset quarantined]
gates:
  affected: []
rollback: reverter migration de workspace_id só é seguro antes de existir mais de um workspace real
risks: mudança de contrato transversal; deve preceder qualquer dado multiusuário real
```
