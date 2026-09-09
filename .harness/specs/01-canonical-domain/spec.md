# Spec 01 — Combat Canonical Model

## Entidades

### Attack

```text
id
name
startup_frames
active_frames
recovery_frames
damage
hitstun_frames
hitstop_frames
blockstun_frames
chip_damage
guard_break_value
invuln_windows
armor_windows
resource_costs
tags
```

### Hitbox

```text
id
attack_id
hitbox_type
shape
offset_by_frame
active_window
damage_multiplier
knockback
launch
```

### CancelRule

```text
source_attack
target_action
min_frame
max_frame
condition: on_hit|on_block|on_whiff|always
resource_cost
```

### CombatState

```text
id
category
interruptible
invulnerable
airborne
grounded
```

`invulnerable` em CombatState é o valor default do personagem nesse estado. Quando um Attack define `invuln_windows` ou `armor_windows`, esses intervalos por frame têm precedência sobre o default do estado durante a execução do ataque.

### Archetype

```text
id
reaction_window_min
max_juggle_frames
max_sustained_dps
escape_rules
```

## Identidade

Como o mesmo Attack pode se originar de Unity, Unreal ou Godot, `id` é qualificado por engine e projeto (`{engine}:{project_id}:{local_id}`) para evitar colisão entre assets equivalentes de fontes diferentes. Deduplicação semântica (mesmo ataque representado em duas engines) é uma relação explícita no KG, nunca uma fusão silenciosa de `id`.

## Tipos de Hitbox

`hitbox_type: strike|throw|projectile|counter`. O tipo determina quais invariantes de interação se aplicam (ex.: `throw` ignora bloqueio; `invuln_windows` com escopo `strike` não neutraliza `throw`).

## Invariantes

- startup >= 0;
- active > 0;
- recovery >= 0;
- damage >= 0;
- chip_damage >= 0 e chip_damage <= damage;
- guard_break_value >= 0;
- costs >= 0;
- cancel range válido;
- hitbox somente dentro da timeline;
- invuln_windows e armor_windows somente dentro de [0, startup+active+recovery), sem sobreposição entre janelas do mesmo tipo no mesmo Attack.

## Tempo

Inteiro em frames. Sem float para lógica de frame.

## Provenance

Cada campo crítico precisa de:

```text
engine
project_revision
source_path
asset_id
parser_version
confidence
```

## Impacto

Canonical model afeta ingestion, KG, simulator, gate, MCP e UI.

## Testes

Fixtures: ataque simples, multi-hit, cancel, airborne, counter-hit, armor, ausência de hitbox, ataque bloqueado (blockstun/chip/guard_break), throw contra invuln de strike, ids colidentes entre engines diferentes.

## Aceite

Entradas semanticamente equivalentes de engines diferentes devem produzir snapshots canônicos equivalentes.
