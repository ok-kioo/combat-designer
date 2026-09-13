# Lesson — Do Not Preserve Legacy Runtime Because Code Exists

## LESSON-ID
LESSON-016

## Problem
Preservar ou documentar código obsoleto como se fizesse parte da arquitetura alvo simplesmente porque ele já foi escrito e está compilando no repositório.

## Why It Matters
A existência de contratos como `MechanicalGatePort`, `GateResult` ou `apply-changeset.ts` nos arquivos de código-fonte é um fato histórico, mas documentá-los como arquitetura canônica confunde agentes futuros e eterniza caminhos que contrariam a direção estratégica do produto.

## General Principle
A arquitetura alvo determina o que as especificações declaram. Código existente que contradiz o alvo é classificado explicitamente como `CODE_LEGACY` e escalado para `MUST_REMOVE_NOW`, com plano concreto de remoção e desconexão.

## Recommended Approach
1. Declarar com clareza nas especificações a arquitetura canônica desejada.
2. Registrar o código divergente em uma seção de `Code Divergence Registry`.
3. Extrair a lógica ou algoritmos úteis (ex: algoritmos de detecção de ciclo ou cálculo de DPS) para módulos limpos.
4. Desconectar, isolar e remover as dependências do runtime em relação aos contratos obsoletos.
