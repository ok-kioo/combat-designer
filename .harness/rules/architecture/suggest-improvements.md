# Regra — suggest-improvements

## Objetivo

Permitir sugestões de melhoria sem transformar sugestões em alterações silenciosas.

## Prioridade

- P0: correctness/security
- P1: reliability/performance
- P2: maintainability
- P3: ergonomics
- P4: cosmetic

## Formato

```yaml
title:
priority:
problem:
evidence:
proposed_change:
affected_domains:
risk:
test_needed:
migration_needed:
can_be_deferred:
```

## Regra

O agente pode sugerir, mas não pode:

- aplicar silenciosamente;
- declarar PASS;
- remover gate;
- inventar frame data;
- apagar provenance.

## Linguagem de qualidade

Preferir:

> "O ciclo Light -> Dash -> AirSlash tem custo líquido 0 e nenhuma saída; adicionar 4 stamina ao Dash elimina o sustain infinito no cenário X."

Evitar:

> "O combo parece forte."

## Ciclo

```text
SUGGESTED -> ACCEPTED | DEFERRED | REJECTED
```

`ACCEPTED` gera task/spec. Sugestões recorrentes viram lições.
