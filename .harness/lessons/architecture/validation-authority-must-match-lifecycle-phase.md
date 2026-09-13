# Lesson — Validation Authority Must Match Lifecycle Phase

## LESSON-ID
LESSON-015

## Problem
Atribuir autoridade de governança em etapas incorretas do ciclo de vida. Por exemplo, renomear um Gate de aceitação de código para "Mechanical Verification" e mantê-lo como etapa mandatória no runtime de produto não remove o acoplamento errôneo — apenas o mascara.

## Why It Matters
Apenas alterar nomes cosméticos (`GateResult` $\rightarrow$ `VerificationResult`, `GateVerdict` $\rightarrow$ `VerificationOutcome`) enquanto se preserva o mesmo nó obrigatório na esteira de produção perpetua a dívida técnica e impede a evolução de uma arquitetura verdadeiramente modular e consultiva.

## General Principle
A autoridade de uma validação deve coincidir estritamente com a fase do ciclo de vida que ela governa:
- Autoridade de **build/PR/release**: pertence ao ambiente de desenvolvimento e CI/CD.
- Autoridade de **segurança de rede e tenant**: pertence ao Gateway e à camada de autenticação.
- Autoridade de **diagnóstico de combate**: pertence ao motor de análise e ao usuário designer.

Renomear um componente de validação de desenvolvimento não o transforma em arquitetura de runtime válida.

## Recommended Approach
Identificar se a funcionalidade avalia código/especificação ou dados do jogo. Se avalia código, deve residir exclusivamente no harness de desenvolvimento. Se avalia dados de jogo, deve ser projetada como análise/diagnóstico sem semântica de bloqueio de CI.
