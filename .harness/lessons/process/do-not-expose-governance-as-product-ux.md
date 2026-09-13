# Lesson — Do Not Expose Implementation Governance as Product UX

## LESSON-ID
LESSON-017

## Problem
Exibir conceitos de governança de desenvolvimento de software (como branches, PRs, gates de build, aprovação de changesets e vereditos PASS/FAIL) na interface do usuário final de um aplicativo de design de combate.

## Why It Matters
O usuário final (designer de combate) está focado em balanceamento, timing de animações, curvas de dano e combos. Enfrentar mensagens como "Gate aprovado", "ChangeSet aplicado" ou badges de CI na tela de workbench cria ruído cognitivo, expõe detalhes de implementação e prejudica a usabilidade do produto.

## General Principle
Terminologias e mecanismos de governança de código pertencem às ferramentas de desenvolvimento (Git, CI, harness). A experiência do usuário (UX) deve expressar exclusivamente abstrações do domínio do produto: catálogo de golpes, simulação temporal, análises de combate, achados (`Findings`) e recomendações fundamentadas.

## Recommended Approach
- Expurga terminologia como "Gate", "ChangeSet", "Apply" e "PASS/FAIL" das telas de produto.
- Empregar conceitos de domínio: "Análise", "Diagnóstico", "Achado", "Evidência", "Recomendação".
- Tratar o assistente de IA como consultor analítico, nunca como aplicador automático de patches.
