# Regra — mcp-gateway-invariants

## Objetivo

Invariantes de segurança e integridade que o MCP Gateway deve satisfazer em todas as condições de operação. Estas invariantes são verificáveis por testes automatizados e não dependem de obediência do LLM.

---

## GW-I01 — Principal identificável

Toda chamada MCP possui principal identificável. Chamada sem principal autenticado → DENY.

## GW-I02 — Workspace obrigatório

Toda chamada que acessa dados de workspace possui `workspace_id`. Chamada sem `workspace_id` quando a tool o exige → DENY.

## GW-I03 — Workspace autorizado

`workspace_id` precisa estar autorizado para o principal autenticado. `workspace_id` enviado pelo cliente é declaração de intenção, não prova de autorização. O Gateway valida contra o conjunto autorizado.

## GW-I04 — Tool desconhecida negada

Tool não registrada no Tool Registry → DENY.

## GW-I05 — Capability ausente negada

Principal sem a capability requerida pela tool → DENY.

## GW-I06 — LLM não aplica sem capability

LLM não pode aplicar ChangeSet sem capability `changeset:apply` explicitamente concedida. Default para LLM é DENY.

## GW-I07 — Tool não escreve Postgres

Nenhuma MCP tool possui acesso direto a Postgres para escrita. Toda persistência passa pelo Application Layer.

## GW-I08 — Tool não escreve Neo4j

Nenhuma MCP tool possui acesso direto a Neo4j para escrita. Toda projeção passa pelo Application Layer.

## GW-I09 — Tool não altera canonical state

Nenhuma MCP tool pode alterar canonical state sem passar pela Application Layer.

## GW-I10 — ChangeSet rejeitado pelo Gate não é aplicável

ChangeSet com GateResult FAIL não pode ser aplicado. Tentativa → DENY com evidência.

## GW-I11 — GateResult STALE não autoriza

GateResult cujo `model_revision` ou `rule_set_version` não corresponde ao estado atual → STALE → não autoriza aplicação.

## GW-I12 — BUDGET_EXCEEDED não é PASS

`BUDGET_EXCEEDED` é "não decidido", não "seguro". Não pode ser usado para autorizar aplicação.

## GW-I13 — ERROR não é PASS

`ERROR` é falha inesperada. Não pode ser usado para autorizar aplicação.

## GW-I14 — Falha de autorização resulta em DENY

Qualquer falha, timeout ou incerteza no processo de autorização resulta em DENY. Nunca em fallback permissivo.

## GW-I15 — Untrusted text não é instrução

Dados marcados como `untrusted_text` (nomes de assets, comentários de engine, strings de AnimNotify) nunca podem constituir isoladamente uma instrução executável, uma capability, ou uma decisão de autorização.

## GW-I16 — Gateway não julga mecânica

O Gateway nunca decide se um combo é mecanicamente válido, se um DPS é aceitável, ou se um ciclo é seguro. Essa é responsabilidade exclusiva do Mechanical Gate via Simulator.

## GW-I17 — LLM não altera resultado do Gate

O LLM nunca pode alterar, substituir, reinterpretar ou invalidar o resultado do Mechanical Gate. O LLM pode explicar, propor alternativas e criar novos ChangeSets. O resultado do Gate é imutável após emissão.

---

## Enforcement

Cada invariante deve possuir pelo menos um teste automatizado que demonstre a propriedade. Invariantes violadas em STRICT mode devem falhar o build/CI.

## Referências

- `docs/architecture/mcp-gateway.md`
- `specs/06-mcp-llm-orchestration.md`
- `specs/05-mechanical-gate.md`
- `specs/09-ingestion-security-and-execution-limits.md`
- `skills/mechanical-gate-verification.md`
