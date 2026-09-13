# Consolidated Lessons Learned

## Formato Padrão

```text
LESSON-ID
Contexto
Falha
Causa
Regra derivada
Detecção
Prevenção
Regressão
```

---

## LESSON-001 — LLM não é avaliador de fatos mecânicos

Sem resultado determinístico emitido pela simulação e pela Combat Analysis, palavras de LLMs como "seguro", "balanceado" ou "sem bugs" não constituem evidência.

## LESSON-002 — Tempo em frames inteiros

Evitar floats no domínio de combate. Toda temporalidade no core deve ser discreta (`u32`/`u64` frames a 60 FPS); conversão para segundos/milissegundos pertence unicamente à camada de apresentação/UI.

## LESSON-003 — Provenance é dado de primeira classe

Qualquer valor numérico ou propriedade crítica de gameplay sem origem rastreável de asset é considerada inválida em perfil estrito.

## LESSON-004 — Knowledge Graph não é simulador temporal

Graph traversal encontra nós e relacionamentos estruturais; não substitui o cálculo temporal frame a frame de colisões, reações e cancels.

## LESSON-005 — Modularidade antes de distribuição física

Um monorepo modular com fronteiras limpas de pacotes reduz complexidade operacional e acelera refatorações antes de o domínio estabilizar.

## LESSON-006 — Fixtures determinísticas e sintéticas

Utilizar casos sintéticos mínimos e fixtures canônicas controladas para testes de regressão, garantindo repetibilidade de hashes.

## LESSON-007 — Balanceamento e frame data são contratos

Alterar hitstun, startup, recovery ou janelas de cancel muda a semântica do jogo e exige análise de impacto (FIC) e validação de regressão mecânica.

## LESSON-008 — Feature Impact Contract (FIC) é obrigatório

Schema, parser, simulator, análise diagnóstica e UI podem estar acoplados semanticamente mesmo quando o código físico está desacoplado em pacotes distintos.

## LESSON-009 — Validação de desenvolvimento tem prazo de validade (Stale Protection)

Um veredito de aceitação de código de desenvolvimento (`PASS`) não vinculado explicitamente a `model_revision` e `rule_set_version` pode ser reaproveitado indevidamente. Validação de harness sem vínculo exato de revisão é considerada `STALE`.

## LESSON-010 — Texto de asset é dado, não instrução

Nomes, comentários e strings de AnimNotify extraídos de assets de engines podem conter injeções ou ruído. Conteúdo de asset deve ser tratado como dado não confiável (`untrusted_text: true`).

## LESSON-011 — Prompt não confere autorização

O `workspace_id` enviado pelo cliente em chamadas de ferramenta é declaração de intenção, não prova de autorização. O Gateway valida contra o conjunto autorizado do principal autenticado.

## LESSON-012 — Gateway é fronteira, não analista de combate

O MCP Gateway decide "pode acessar?", não "quais as propriedades do combate?". Gateway cuida de autenticação e isolamento; Simulator cuida de física e eventos; Combat Analysis cuida de diagnósticos; Combat Director formula recomendações.

---

## Lições Arquiteturais Específicas

- **[LESSON-013: Do Not Mix Runtime Analysis with Development Gates](./architecture/do-not-mix-runtime-analysis-with-development-gates.md)**: Nunca transformar um mecanismo de aceitação de pull request/código do harness em autoridade mandatória de tempo de execução no produto.
- **[LESSON-014: Analysis Result Is Not Approval Result](./architecture/analysis-result-is-not-approval-result.md)**: Resultados de análise de combate relatam fatos observados (`Findings`), não vereditos de aprovação de software.
- **[LESSON-015: Validation Authority Must Match Lifecycle Phase](./architecture/validation-authority-must-match-lifecycle-phase.md)**: Renomear cosmeticamente um Gate não o transforma em arquitetura de runtime válida; a autoridade deve coincidir com a fase do ciclo de vida governada.
- **[LESSON-016: Do Not Preserve Legacy Runtime Because Code Exists](./process/do-not-preserve-legacy-runtime-because-code-exists.md)**: Não documentar código divergente como alvo canônico só porque ele já foi escrito. Escalar para `MUST_REMOVE_NOW`.
- **[LESSON-017: Do Not Expose Implementation Governance as Product UX](./process/do-not-expose-governance-as-product-ux.md)**: Termos de governança de código (Gate, ChangeSet, Apply, PASS/FAIL) pertencem ao desenvolvimento e devem ser purgados da interface do produto.
