# Knowledge Graph Architecture (SPEC 03)

## 1. Architectural Role & Invariants

O **Knowledge Graph (Neo4j)** no ecossistema Combat Designer atua estritamente como **camada de projeção, indexação relacional e descoberta estrutural**.

### Invariantes Fundamentais:
1. **Nunca é autoridade mecânica**: O grafo não resolve física, não calcula colisões no tempo, não decide interrupções e não avalia o Mechanical Gate. Toda autoridade canônica pertence ao `engine/combat-domain` e ao determinismo de snapshots.
2. **Separação estrita de domínios**: `engine/combat-domain` não possui referências ou dependências para Neo4j, Cypher, HTTP ou drivers. O adaptador reside exclusivamente em `backend/infrastructure/neo4j/`.
3. **Workspace Isolation Transversal**:
   - Todo nó e todo relacionamento persistem `workspace_id`.
   - Todas as queries Cypher exigem `workspace_id` em seus parâmetros parametrizados.
   - Qualquer tentativa de consulta ou projeção sem `workspace_id` falha imediatamente (*fail-closed*).
4. **Idempotência**: Projeções sucessivas do mesmo snapshot canônico utilizam `MERGE` e produzem o mesmo estado grafal, sem duplicação de nós ou arestas.
5. **Detecção de STALE**: Compara o hash SHA-256 do snapshot atual com o metadado projetado (`ProjectionMetadata`), além de validar se a versão do schema (`GRAPH_SCHEMA_VERSION = "1.0.0"`) não sofreu drift.

---

## 2. Fluxo de Dados

```text
Canonical Combat Snapshot (JSON/Domain)
           │
           ▼
 Application / Projector (@combat-designer/graph-adapter)
           │
           ▼
  Graph Adapter (Neo4jGraphDriver / InMemoryGraphDriver)
           │
           ▼
    Neo4j Community (v5.26.0)
```

---

## 3. Modelo de Grafo (Schema & Constraints)

### Versionamento
* **GRAPH_SCHEMA_VERSION**: `1.0.0`
* **PROJECTOR_VERSION**: `1.0.0`

### Labels de Nós
* `:Attack`: Identidade canônica do ataque (`attack_id`, `workspace_id`, `name`, `startup_frames`, `active_frames`, `recovery_frames`, `damage`, etc.).
* `:Hitbox`: Volume e propriedades de contato (`hitbox_id`, `workspace_id`, `shape_type`, `launch`, `damage_multiplier_permille`, etc.).
* `:CancelRule`: Janela e condição de transição (`cancel_id`, `workspace_id`, `start_frame`, `end_frame`, `condition`, `target_action`).
* `:ResourceCost`: Consumo de recursos de combate (`resource_cost_id`, `workspace_id`, `resource_type`, `amount`, `cost_frame`).
* `:Provenance`: Rastreabilidade de ingestão original (`provenance_id`, `workspace_id`, `engine`, `source_path`, `asset_id`, `confidence_permille`).
* `:ProjectionMetadata`: Estado e carimbo da última projeção por projeto (`workspace_id`, `project_id`, `snapshot_hash`, `revision`, `graph_schema_version`, `status`).

### Tipos de Relacionamentos
* `(Attack)-[:HAS_HITBOX {workspace_id}]->(Hitbox)`
* `(Attack)-[:HAS_CANCEL {workspace_id}]->(CancelRule)`
* `(CancelRule)-[:CANCELS_TO {workspace_id}]->(Attack)`
* `(Attack)-[:REQUIRES_RESOURCE {workspace_id}]->(ResourceCost)`
* `(Attack)-[:HAS_PROVENANCE {workspace_id}]->(Provenance)`

### Constraints de Unicidade Composta (Neo4j 5.x)
Para garantir isolamento multi-tenant a nível de banco de dados:
```cypher
CREATE CONSTRAINT attack_workspace_unique IF NOT EXISTS
FOR (n:Attack) REQUIRE (n.workspace_id, n.attack_id) IS UNIQUE;

CREATE CONSTRAINT hitbox_workspace_unique IF NOT EXISTS
FOR (n:Hitbox) REQUIRE (n.workspace_id, n.hitbox_id) IS UNIQUE;

CREATE CONSTRAINT cancel_workspace_unique IF NOT EXISTS
FOR (n:CancelRule) REQUIRE (n.workspace_id, n.cancel_id) IS UNIQUE;

CREATE CONSTRAINT resource_workspace_unique IF NOT EXISTS
FOR (n:ResourceCost) REQUIRE (n.workspace_id, n.resource_cost_id) IS UNIQUE;

CREATE CONSTRAINT provenance_workspace_unique IF NOT EXISTS
FOR (n:Provenance) REQUIRE (n.workspace_id, n.provenance_id) IS UNIQUE;

CREATE CONSTRAINT proj_meta_workspace_unique IF NOT EXISTS
FOR (n:ProjectionMetadata) REQUIRE (n.workspace_id, n.project_id) IS UNIQUE;
```

---

## 4. Query Catalog (Q01 a Q06)

O catálogo de queries provê acesso seguro e delimitado para indexação e análise estrutural:

| Código | Nome | Propósito | Limite / Clamping |
|---|---|---|---|
| **Q01** | `queryCancelOptions` | Lista ataques alcançáveis por cancelamento direto a partir de um ataque de origem | N/A (1-hop direto) |
| **Q02** | `queryPathsToLauncher` | Caminhos de cancelamento até um ataque com hitbox de lançamento (`launch: true`) | `max_depth` (1..10, default 5), `LIMIT 50` |
| **Q03** | `queryCandidateCycles` | Detecta ciclos estruturais de cancelamento no grafo (candidatos para validação no simulador) | `max_depth` (2..10, default 6), `max_results` (1..100, default 50) |
| **Q04** | `queryImpactAnalysis` | Análise de impacto e nós conectados a um ataque para simulações de efeito colateral | N/A (grafo local de vizinhança) |
| **Q05** | `queryAttackProvenance`| Recupera metadados de proveniência (engine, asset_id, path) | Exato por ataque |
| **Q06** | `queryScenariosByTag` | Busca cenários e ataques categorizados por tags específicas | `LIMIT 100` |

### Prevenção contra Injeção de Cypher:
Todas as queries do catálogo utilizam parâmetros nomeados (`$workspace_id`, `$attack_id`, etc.). Concatenação de strings contendo input externo é expressamente proibida.

---

## 5. Infraestrutura & Execução

### Docker Compose
Para ambientes com Docker disponível, o arquivo `docker-compose.yml` declara a imagem oficial fixada:
* Imagem: `neo4j:5.26.0-community` (versão explícita, nunca `latest`)
* Porta: `7474` (HTTP Browser) e `7687` (Bolt)
* Variáveis: `NEO4J_AUTH=neo4j/${NEO4J_PASSWORD:-combat_designer_secure_pass}`
* Volume persistente: `neo4j_data:/data`

### In-Memory Driver (`InMemoryGraphDriver`)
Para ambientes de sandbox restritos, CI rápido sem daemon Docker ou execução puramente determinística em testes, `packages/graph-adapter` disponibiliza `InMemoryGraphDriver`. Ele emula a semântica transacional, verificação de constraints compostas, isolamento estrito de workspace e suporte integral às queries Q01–Q06.
