# Regra — ask-refactoring

## Objetivo

Impedir que uma feature seja usada como justificativa para refatorações sem necessidade ou sem cobertura.

## Perguntas obrigatórias

Antes de refatorar:

1. A refatoração é necessária para a feature?
2. Existe violação de isolamento?
3. Existe duplicação semântica?
4. Há teste/fixture que congele o comportamento atual?
5. A mudança é estrutural ou altera gameplay?

Se alterar gameplay, não é refactor puro: precisa de spec própria.

## Processo

1. Registrar motivo e domínios afetados.
2. Executar testes e mechanical gate do baseline.
3. Capturar hashes de fixtures/simulações.
4. Fazer refactor sem alterar semântica.
5. Reexecutar as mesmas fixtures.
6. Comparar estados, eventos, métricas e GateResult.
7. Só depois implementar a feature.

## Proibido

- misturar refactor e balanceamento no mesmo change set;
- alterar frame timing em uma "limpeza";
- atualizar snapshots apenas para esconder regressão;
- aceitar refactor porque "o LLM sugeriu".

## Critério de aceite

Refactor só passa quando o comportamento é semanticamente equivalente e qualquer diferença intencional possui ChangeSet/spec explícito.
