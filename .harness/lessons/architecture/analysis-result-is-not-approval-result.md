# Lesson — Analysis Result Is Not Approval Result

## LESSON-ID
LESSON-014

## Problem
Resultados de análise e diagnósticos mecânicos de combate foram concebidos como vereditos binários de aprovação (`PASS` ou `FAIL`), criando a falsa equivalência de que "detectar um loop de stun" significa "o sistema falhou ou reprovou a requisição".

## Why It Matters
Em um software de auxílio ao design de jogos, detectar que um combo causa 300 de dano ou gera um loop infinito é um **fato analítico útil**, não um erro de software ou uma rejeição do sistema. O papel da ferramenta é expor evidências para que o designer humano tome decisões criativas e de balanceamento fundamentadas.

## General Principle
- A análise de runtime relata **o que foi observado** com precisão determinística.
- A validação de harness avalia **se o código implementado cumpre os contratos de engenharia**.

## Example
- **Correto no Produto**: "Achado detectado: `INFINITE_STUN_LOOP`. Severidade: `CRITICAL`. Evidência: frames 12-48, ciclo entre Slash e Kick sem janela de escape."
- **Incorreto no Produto**: "GateResult: FAIL. Operação bloqueada pelo Gate Mecânico."
- **Correto no Harness**: "Teste de regressão `G02_INFINITE_LOOP`: PASS. O algoritmo detectou o ciclo conforme a fixture."

## Validation
- Modelos de análise estruturam achados como `Finding { type, severity, evidence, explanation }`.
- Status de execução refletem completude computacional (`COMPLETED`, `INCONCLUSIVE`, `BUDGET_EXCEEDED`), nunca juízo de valor sobre o design do jogo.
