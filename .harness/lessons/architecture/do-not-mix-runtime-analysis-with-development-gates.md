# Lesson — Do Not Mix Runtime Analysis with Development Gates

## LESSON-ID
LESSON-013

## Problem
Um mecanismo de validação e governança de desenvolvimento (Mechanical Gate) foi historicamente modelado como se fosse uma camada de execução em tempo de execução para o usuário final, impondo uma semântica mandatória de aprovação (`PASS` / `FAIL` / `BLOCKED`) no pipeline de produto.

## Why It Matters
Essa mistura vaza responsabilidades de governança de código para o produto final. Ela força fluxos conversacionais a emitirem "Gate aprovado" e obriga designers a lidarem com jargões de aceitação de pull request. Além disso, introduz portas e serviços pesados de aprovação que travam a visualização e exploração dos dados quando o sistema deveria apenas analisar, diagnosticar e recomendar.

## General Principle
Gates de aceitação de código pertencem ao **harness de desenvolvimento**; análises diagnósticas de domínio pertencem ao **runtime do produto**.

```text
PRODUCT: Simulation -> Combat Analysis -> Findings + Evidence -> Director -> Recommendations
HARNESS: Specs + Rules -> Implementation -> Tests -> Mechanical Gate -> PASS/FAIL do código
```

## Recommended Approach
- O runtime de produto produz achados de domínio (`Findings`, `Diagnostics`, `Evidence`).
- O harness de desenvolvimento roda testes e validação mecânica de implementação (`PASS` / `FAIL`).
- Nenhuma rota ou caso de uso de produção depende de vereditos de Gate.
- A terminologia de aprovação e Gate é purgada da UI voltada ao usuário.

## Validation
- Nenhuma especificação de produto referencia um Gate como etapa mandatória de runtime.
- A UI não exibe badges `PASS` / `FAIL` como status de entidades do jogo.
- O motor de análise retorna `AnalysisStatus` (`COMPLETED`, `INCONCLUSIVE`, `BUDGET_EXCEEDED`, `STALE`, `ERROR`).
