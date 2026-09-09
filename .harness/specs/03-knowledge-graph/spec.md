# Spec 03 — Knowledge Graph

## Nós

```text
Project, Revision, Character, Attack, Animation, Hitbox,
Hurtbox, CancelRule, CombatState, EnemyArchetype, Resource,
Scenario, Constraint, GateRule, SourceAsset
```

## Relações

```text
Attack-USES_ANIMATION->Animation
Attack-HAS_HITBOX->Hitbox
Attack-CAN_CANCEL_TO->Action
Attack-CAUSES->HitReaction
Attack-COSTS->Resource
Attack-VALID_IN->CombatState
Scenario-TARGETS->EnemyArchetype
Revision-CONTAINS->Attack
Attack-DERIVED_FROM->SourceAsset
Attack-EQUIVALENT_TO->Attack
```

`EQUIVALENT_TO` liga manualmente ou por regra explícita dois Attacks de engines diferentes que representam o mesmo ataque de design (ver Identidade em Spec 01). Nunca é inferida por igualdade de nome.

## Projeção

```text
Postgres canonical snapshot
 -> idempotent graph projector
 -> Neo4j
```

## Consistência

Comparar snapshot hash com projected hash. Se divergente: `STALE`.

O grafo projetado carrega uma property `graph_schema_version` no nó `Revision`. Uma mudança na definição de nós/relações (independente de mudança de dados) exige bump dessa versão e reprojeção completa; comparar apenas `snapshot hash x projected hash` não detecta drift de schema do grafo em si.

## Consultas essenciais

1. opções de cancel de um ataque;
2. caminhos até launcher;
3. ciclos de ações;
4. entidades afetadas por uma mudança;
5. provenance;
6. cenários dependentes de um parâmetro.

## Aceite

Dado AttackId, recuperar timeline, hit reactions, cancels, custos, estados, provenance e scenarios.
