# Skill — Mechanical Gate Verification

## Objetivo

Provar mecanicamente que um ChangeSet respeita as invariantes de combate.

## Pipeline

```text
ChangeSet
 -> schema validation
 -> scenario construction
 -> deterministic simulation
 -> cycle analysis
 -> resource analysis
 -> reachability
 -> DPS/juggle checks
 -> GateResult
```

## GateResult

```json
{
  "status": "PASS|FAIL|BLOCKED|ERROR|STALE",
  "rule_set_version": "v1",
  "model_revision": "...",
  "simulation_hash": "...",
  "checks": []
}
```

## Gates mínimos

### G01 Determinism

Mesma entrada deve produzir o mesmo StateHash.

### G02 Infinite loop

Para cada ciclo alcançável, deve existir pelo menos uma saída:

- escape;
- custo líquido;
- contador finito;
- transição terminal.

### G03 Stun lock

O alvo deve obter janela mínima de reação quando o arquétipo exigir.

### G04 Resource sustainability

Combos proibidos de sustentar indefinidamente devem ter custo líquido negativo por ciclo.

### G05 Sustained DPS

DPS em janela definida não pode exceder o limite do arquétipo.

### G06 Burst

Dano máximo de sequência não pode exceder o limite.

### G07 Juggle

Tempo contínuo no ar deve respeitar o limite.

### G08 Cancel validity

Cancel somente dentro da janela e condição.

### G09 Provenance

Parâmetro crítico sem origem verificável => BLOCKED/FAIL em STRICT.

### G10 Guard integrity

Attack com guard_break_value > 0 precisa de cenário comprovando ao menos uma opção de saída para o defensor antes do guard break; ausência => FAIL em STRICT.

## Algoritmo de loop

1. Construir state graph.
2. Remover estados inalcançáveis.
3. Calcular strongly connected components.
4. Para cada SCC, verificar saída, custo e contador.
5. Simular concretamente ciclos suspeitos.
6. Registrar evidência.

## Fail closed

Se não for possível provar segurança em STRICT, não retornar PASS.

## Fast vs Deep

Fast: PR, checks locais.

Deep: merge/release, todos cenários, property tests, busca ampliada e baseline comparison.

## Mensagem humana

```text
FAIL — NO_INFINITE_CYCLE
Cycle: Light -> DashCancel -> AirSlash -> Light
Cycle cost: 0 stamina
Escape: none
Observed reaction window: 0f
```

Sugestões são apenas sugestões.
