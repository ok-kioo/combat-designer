# Spec 05 — Mechanical Gate

## Interface

```text
run_gate(changeset, baseline_revision, scenarios, gate_profile)
 -> GateResult
```

## Profiles

### fast

Schema, determinism, ciclos locais, recursos, DPS básico e provenance.

### strict

Todos os cenários, SCC, bounded exhaustive search, property tests e comparação com baseline.

### research

Heurístico; nunca autoriza release.

## Regras

### NO_INFINITE_LOOP

Falhar se houver ciclo alcançável sem escape, custo líquido, contador finito ou terminal.

### NO_STUN_LOCK

Falhar quando a reação mínima do arquétipo nunca ocorre.

### MAX_SUSTAINED_DPS

DPS acima do limite => FAIL.

### MAX_BURST

Burst acima do limite => FAIL.

### MAX_JUGGLE

Juggle acima do limite => FAIL.

### RESOURCE_SAFETY

Sustain infinito proibido => FAIL.

### CANCEL_VALIDITY

Cancel fora da janela/condição => FAIL.

### PROVENANCE_REQUIRED

Dado crítico sem origem => BLOCKED/FAIL em STRICT.

### GUARD_INTEGRITY

Todo Attack com `guard_break_value > 0` deve ter cenário associado comprovando que o defensor retém pelo menos uma opção de saída (bloqueio, invuln ou escape) antes do guard break ser atingido em uso normal do arquétipo; ausência de cenário associado => FAIL em STRICT.

## Estados

```text
PASS
FAIL
BLOCKED
ERROR
STALE
BUDGET_EXCEEDED
```

BLOCKED não é PASS. STALE não é PASS: é um PASS anterior cuja validade expirou por avanço de `model_revision` ou `rule_set_version` (ver Aceite). `BUDGET_EXCEEDED` não é PASS nem FAIL nem ERROR: significa que o orçamento de execução (specs/04, specs/09) esgotou antes de uma decisão — "não decidido", distinto de "viola regra" (FAIL) e de "falha inesperada" (ERROR).

### EXECUTION_BUDGET

Regra que classifica o resultado como `BUDGET_EXCEEDED` quando `wall_clock_timeout_ms` ou `max_iterations` (specs/04) é atingido antes de as demais regras concluírem. `BUDGET_EXCEEDED` nunca autoriza publicação em STRICT, no mesmo espírito de BLOCKED.

## Evidência

Cada check retorna rule_id, scenario, simulation_hash, threshold, observed, expected e evidence.

## Aceite

Não existe publicação em STRICT sem GateResult PASS.

Um GateResult PASS é válido somente para o par exato `(model_revision, rule_set_version)` em que foi gerado. Se o `model_revision` avançar ou `rule_set_version` mudar antes do release, o PASS anterior passa a `STALE` e não pode ser usado para autorizar publicação; o gate deve ser reexecutado.
