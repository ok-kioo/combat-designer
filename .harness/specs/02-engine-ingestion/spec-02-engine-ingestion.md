# Spec 02 — Engine Ingestion

## Pipeline

```text
project root
 -> discovery
 -> classification
 -> parser
 -> normalization
 -> validation
 -> provenance
 -> snapshot
```

## Unity

Suportar inicialmente:

- ScriptableObject;
- AnimationClip;
- AnimatorController;
- scripts/configs de combate.

## Unreal

Suportar inicialmente:

- DataAsset;
- AnimSequence;
- AnimMontage;
- AnimNotify;
- Gameplay Tags/Abilities quando presentes.

## Godot

Suportar inicialmente:

- .tres;
- .res;
- .json;
- AnimationPlayer;
- Resources/scripts.

## Regra

Parser produz RawExtraction. Normalizer produz CanonicalCombatModel. Parser nunca grava Neo4j diretamente.

## Conflito

Valores conflitantes => `CONFLICT`, nunca escolha silenciosa.

## Falha de parse

Asset corrompido, schema desconhecido ou campo obrigatório ausente => `QUARANTINED`, nunca substituído por default silencioso nem omitido do snapshot. O asset quarentenado é listado no relatório de ingestão com motivo e path; assets não relacionados continuam o pipeline normalmente.

## Drift de schema

Aumentar `parser_version` é obrigatório sempre que o parser mudar como interpreta um formato de asset (mesmo sem mudança de output shape), pois `parser_version` é parte do critério de reaproveitamento incremental e da chave de aceite descrita abaixo.

## Incremental

Hash por asset. Asset não alterado pode ser reaproveitado somente se `parser_version` também não tiver mudado desde o último snapshot; mudança de `parser_version` invalida o cache incremental para todos os assets do tipo afetado.

## Aceite

Mesma revisão + mesmo parser version => mesmo canonical snapshot hash.

## Modelo de entrega

"project root" acima é o root local de onde um script de exportação lê dentro da engine do
usuário (ver specs/08) — não um root acessado remotamente pelo backend. O backend recebe
apenas o Export Bundle já produzido. Validação de envelope do bundle e limites de
tamanho/aninhamento estão em specs/09; o comportamento de `QUARANTINED` por asset acima
permanece inalterado por esse modelo de entrega.

## Somente leitura

O pipeline é estritamente unidirecional: engine -> Export Bundle -> backend. Em nenhuma etapa o
backend, o MCP ou a LLM escrevem, corrigem ou reexportam qualquer arquivo de volta para o projeto
Unity/Unreal/Godot do usuário. O produto do sistema para o usuário é sempre um artefato interno
(ChangeSet proposto, relatório do Mechanical Gate, análise de combos/impacto) que o próprio
designer decide se e como replica manualmente na engine — nunca uma mutação automática de asset.
Isso é um invariante, não uma limitação atual: nenhuma feature futura pode introduzir escrita no
projeto de origem sem revisar este invariante explicitamente via FIC.
