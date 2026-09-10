# Skill — Spec Compliance Gate (Mechanical Gate do agente)

## Objetivo

O Mechanical Gate descrito em `.harness/specs/05-mechanical-gate/spec.md` decide se um **combate simulado** é
mecanicamente seguro. Esta skill é o equivalente aplicado ao **próprio trabalho do agente sobre o repositório**:
decide se uma mudança de código/spec está mecanicamente apta a ser considerada concluída. É um gate de processo,
não de runtime — não roda no Rust, roda como checklist obrigatório do agente antes de declarar uma tarefa pronta.

Motivação concreta: a consolidação de `backend/` em um único pacote (ver
`.harness/skills/architecture/domain-oriented-folder-structure.md`, seção "Atualização — consolidação de pacotes")
aconteceu sem atualizar `.harness/specs/05-mechanical-gate/spec.md` (5 caminhos ficaram apontando para uma
estrutura que não existia mais) nem a própria skill de arquitetura. Nenhum FIC cobriu essa mudança. Isso é
exatamente o tipo de drift que este gate existe para impedir.

## O que o gate verifica

Antes de qualquer mudança de código, spec ou skill ser considerada `DONE`, todos os itens abaixo devem ser
respondidos com evidência (caminho de arquivo, linha, comando rodado) — não com afirmação sem verificação:

1. **`SPEC_ALIGNMENT`** — A mudança implementa o que a spec correspondente declara, ou a spec foi atualizada
   junto? Se código e spec divergem, um dos dois está errado — nunca deixe os dois existirem em paralelo sem
   marcar qual é a fonte da verdade.
2. **`CROSS_SPEC_IMPACT`** — Alguma outra spec referencia o contrato, caminho de arquivo, nome de pacote ou
   comportamento que esta mudança altera? Buscar por referência textual (grep) não é suficiente sozinho — também
   checar specs que dependem semanticamente da spec alterada (ex.: spec 06 depende dos ports definidos pela
   spec do domínio de combate; specs 08/09 dependem do modelo de workspace). Toda spec afetada é atualizada na
   mesma mudança, não depois.
3. **`PATH_TRUTH`** — Qualquer caminho de arquivo citado em uma spec ou skill (`Implementation Module`,
   `Application Port`, etc.) existe de fato no repositório no momento da checagem. Um caminho stale é tratado
   como bug de documentação, não como detalhe menor.
4. **`FIC_PRESENT`** — Existe um Feature Impact Contract cobrindo a mudança (embutido na spec ou em
   `.harness/docs/feature-impacts/`, conforme a convenção já em uso no repositório — não inventar uma terceira
   convenção). Mudança estrutural sem FIC não é considerada rastreável.
5. **`NO_SILENT_ARCHITECTURE_CHANGE`** — Se a mudança altera fronteira de pacote, direção de dependência ou
   convenção de pasta, o teste de arquitetura correspondente (`shared/architecture` ou equivalente) foi
   atualizado e roda verde — não apenas "deveria continuar valendo".
6. **`INVARIANT_PRESERVED`** — Nenhum invariante já declarado em outra spec foi quebrado silenciosamente (ex.:
   spec 02 declara "somente leitura" em relação à engine de origem; qualquer mudança de ingestão precisa
   reafirmar, não contradizer, esse invariante).
7. **`TEST_EVIDENCE`** — Build, typecheck e suíte de testes relevante rodaram e passaram após a mudança —
   comando e resultado citados, não assumidos.

## Veredito

Mesma semântica do Mechanical Gate de runtime, por analogia:

```text
PASS      — todos os itens verificados com evidência
FAIL      — algum item verificado e reprovado
BLOCKED   — item não verificável no momento (ex.: teste de arquitetura não está no material disponível)
STALE     — a verificação foi feita contra uma revisão do repositório que já mudou
```

`BLOCKED` não é `PASS`. Se um item não pode ser verificado (por exemplo, um diretório citado por uma spec não
está disponível nos arquivos fornecidos ao agente), isso deve ser declarado explicitamente como lacuna de
verificação — nunca presumido como correto.

## Quando aplicar

- Antes de declarar qualquer refatoração estrutural concluída.
- Antes de criar ou revisar uma spec nova.
- Ao final de qualquer auditoria/validação pedida sobre o estado do repositório — o relatório de validação em si
  deve citar quais itens deste gate foram checados e quais ficaram `BLOCKED` por falta de material.
- Nunca como substituto do Mechanical Gate de runtime (specs/05) — este gate nunca avalia combate simulado, DPS,
  stun-lock ou qualquer propriedade mecânica de jogo. Os dois são independentes e não se substituem.
