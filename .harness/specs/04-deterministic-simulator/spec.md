# Spec 04 — Deterministic Simulator

## Input

```text
CombatModel
Scenario
InitialState
Seed
TickRate
MaxFrames
```

## Output

```text
SimulationTrace
FinalState
Events[]
Metrics
StateHash
```

## Ordem de frame

```text
apply_inputs
update_timers
resolve_hitboxes
resolve_block
apply_hit_reactions
resolve_cancel_windows
update_resources
resolve_state_transitions
emit_events
snapshot
```

Essa ordem é contrato.

`resolve_block` decide, para cada colisão hitbox/hurtbox, se o defensor está em estado de guarda válido para aquele `hitbox_type`; em caso positivo, aplica `chip_damage`/`blockstun_frames` em vez de `damage`/`hitstun_frames`. `throw` ignora `resolve_block`.

## Desempate multi-ator

Quando mais de um ator resolve eventos no mesmo frame (múltiplas hitboxes ativando, múltiplos cancels abrindo), a ordem de processamento dentro de cada etapa acima é determinística e definida por `actor_id` ascendente e, em empate, por `attack_id` ascendente. Nenhuma etapa pode depender de ordem de iteração de mapa/hash não ordenado ou de ordem de chegada de mensagens.

## Eventos

AttackStarted, HitboxActivated, HitConfirmed, BlockConfirmed, GuardBroken, HitstunApplied, BlockstunApplied, CancelOpened, CancelExecuted, ResourceSpent, StateChanged, EscapeWindowOpened, AttackRecovered.

## Determinismo

Proibidos: random não-seeded, wall clock, sleep e concorrência não determinística.

## Métricas

Damage, DPS, burst, combo duration, hit count, hitstun coverage, recovery exposure, resource consumption, juggle duration, escape windows.

## Replay

```text
replay_id
simulation_hash
inputs
model_revision
rule_set_version
```

## Orçamento de execução

Todo input inclui `ExecutionBudget: { wall_clock_timeout_ms, max_iterations }`. Estouro do
orçamento (timeout ou fuel) interrompe a execução e retorna `BUDGET_EXCEEDED` com o que foi
explorado até o corte, rotulado como parcial, e a razão (`timeout` | `fuel_exhausted`).
`BUDGET_EXCEEDED` não é `ERROR`: `ERROR` é falha inesperada; `BUDGET_EXCEEDED` é espaço de
busca maior que o orçamento — condição esperada e tratável (ver specs/05, specs/09).
Aplica-se tanto à simulação frame-a-frame quanto a buscas do solver (combo discovery,
otimização de parâmetros).

## Aceite

100 execuções da mesma entrada devem produzir o mesmo StateHash.
