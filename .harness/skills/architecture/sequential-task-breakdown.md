# Skill — Sequential Task Breakdown

## Objetivo

Quebrar features em passos ordenados, verificáveis e reversíveis.

## Cada task precisa de

- precondition;
- action;
- expected result;
- test;
- artifact;
- dependencies;
- impact declaration.

## Ordem

1. comportamento Given/When/Then;
2. domínio proprietário;
3. contratos;
4. modelo;
5. adapter;
6. persistência;
7. simulator;
8. gate;
9. MCP/API;
10. UI;
11. observabilidade;
12. documentação.

## Exemplo: AnimNotify Unreal

```text
T01 CombatEventMarker
T02 parser AnimSequence
T03 parser AnimMontage
T04 normalização para frames
T05 provenance
T06 fixture
T07 snapshot
T08 Neo4j projection
T09 consistency gate
T10 MCP resource
T11 telemetry
```

## Regra

Uma task não pode esconder mudanças de domínios diferentes.

Se uma tarefa alterar simulator + graph + MCP, dividir em tarefas dependentes.

## Critério

O passo seguinte deve depender apenas de artefatos produzidos pelo passo anterior, nunca de estado implícito.
