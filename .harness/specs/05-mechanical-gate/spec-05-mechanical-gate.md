# Spec 05 — Mechanical Gate

**Status**: IMPLEMENTED & VERIFIED
**Implementation Module**: `engine/src/verification` (crate `combat-engine`)
**Contracts/Types**: `backend/src/modules/combat/domain/entity/verification.types.ts`
**Application Port**: `backend/src/modules/combat/domain/repository/mechanical-gate-port.ts`
**Application Use Case**: `backend/src/modules/combat/service/verify-combat.ts`
**FIC**: `.harness/docs/feature-impacts/spec-05-mechanical-gate.yaml`

---

## 1. Visão Geral & Responsabilidade Arquitetural

O Mechanical Gate é a camada formal de **verificação mecânica, prova e decisão de segurança** do Combat Designer.

Sua responsabilidade é avaliar fatos produzidos pelo **Deterministic Combat Simulator** (`engine/src/simulation`) e evidências estruturais provenientes do modelo canônico (`engine/src/domain`), determinando se propriedades mecânicas foram satisfeitas, violadas ou não puderam ser provadas dentro dos limites de verificação.

O Mechanical Gate:
- **Responde**: `"IS THE OBSERVED BEHAVIOR MECHANICALLY SAFE / VALID?"`
- **Não simula física ou colisões** (responsabilidade do Simulator).
- **Não faz chamadas a LLMs** nem aceita texto de LLM como prova.
- **Não concede autorização de API** (responsabilidade do Gateway).
- **Não aprova mutações ou ChangeSets** (responsabilidade estrita de Human Approval).
- **Não persiste automaticamente dados**.

---

## 2. Interface Canônica

```rust
MechanicalVerifier::verify(
    request: &VerificationRequest,
    simulation: &SimulationOutput
) -> GateResult
```

### TypeScript Boundary Port (`MechanicalGatePort`)

```typescript
export interface MechanicalGatePort {
  verify(
    request: VerificationRequest,
    simulation: SimulationOutput
  ): Promise<GateResult>;
}
```

---

## 3. Perfis de Verificação

### `strict`
- Modo padrão e obrigatório para autorização de release.
- Todas as regras ativas (`G01`–`G11` + `Counterplay`).
- **Fail-Closed**: Qualquer evidência inconclusiva, falta de prova, ausência de provenance ou esgotamento de orçamento bloqueia a aprovação (`BLOCKED` / `BUDGET_EXCEEDED`).

### `fast`
- Execução rápida para loops de feedback local em IDE / CLI.
- Ciclos locais, determinismo, integridade de simulação, DPS e recursos.
- Thresholds mais permissivos, ciclo com heurística abreviada.

### `research`
- Perfil puramente experimental e exploratório.
- **`can_authorize_release() == false`**: Nunca autoriza release para produção.

---

## 4. Regras Mecânicas (G01–G11 & Counterplay)

1. **`G01_SIMULATION_INTEGRITY`**: Valida StateHash SHA-256 (64 hex chars), integridade estrutural do log e monotonicidade de sequência.
2. **`G02_INFINITE_LOOP`**: Detecta ciclos nos estados de combate. Falha se houver ciclo sem escape, sem custo de recursos ou progressão forçada (`INFINITE_STUN_LOOP`).
3. **`G03_STUN_LOCK`**: Verifica se o defensor obtém a janela mínima de reação entre hits consecutivos (`STUN_LOCK`).
4. **`G04_RESOURCE_SAFETY`**: Verifica se cadeias de ataques consom recursos e não sustentam vantagem indefinidamente (`RESOURCE_SAFETY`).
5. **`G05_MAX_SUSTAINED_DPS`**: Cálculo sliding-window de dano por segundo normalizado a 60fps usando exclusivamente aritmética de inteiros (`MAX_SUSTAINED_DPS`).
6. **`G06_MAX_BURST`**: Verificação do dano máximo contíguo de sequências de ataque (`MAX_BURST`).
7. **`G07_MAX_JUGGLE`**: Verificação da duração contínua em frames em estado airborne/juggle (`MAX_JUGGLE`).
8. **`G08_CANCEL_VALIDITY`**: Verifica se os cancels observados ocorreram estritamente dentro de janelas válidas (`CANCEL_VALIDITY`).
9. **`G09_PROVENANCE_REQUIRED`**: Em strict, exige proveniência verificável para todos os parâmetros críticos (`PROVENANCE_REQUIRED`).
10. **`G10_ZERO_RISK_ATTACK`**: Detecta ataques com dano elevado, total invulnerabilidade e recuperação impunível. Falha fechado se inconclusivo (`ZERO_RISK_ATTACK`).
11. **`G11_GUARD_INTEGRITY`**: Para ataques com quebra de guarda, exige que o defensor possua opções de escape antes da quebra (`GUARD_INTEGRITY`).
12. **`NO_COUNTERPLAY`**: Verifica existência de janela acionável de contra-ataque durante a recuperação do atacante (`NO_COUNTERPLAY`).

---

## 5. Estados do GateVerdict & Agregação Fail-Closed

```text
PASS
FAIL
BLOCKED
STALE
BUDGET_EXCEEDED
ERROR
```

Regras de agregação:
- Qualquer `ERROR` no simulador ou requisição $\rightarrow$ `GateVerdict::Error`.
- Qualquer esgotamento de orçamento $\rightarrow$ `GateVerdict::BudgetExceeded`.
- Qualquer regra com `FAIL` $\rightarrow$ `GateVerdict::Fail`.
- Qualquer regra com `BLOCKED` ou `INCONCLUSIVE` em `strict` $\rightarrow$ `GateVerdict::Blocked`.
- Todas as regras com `PASS` $\rightarrow$ `GateVerdict::Pass`.

---

## 6. Proteção contra Resultados Obsoletos (Stale Protection)

Um `GateResult` é válido única e exclusivamente para a tupla exata:
$$(workspace\_id, project\_revision, canonical\_snapshot\_hash, simulation\_input\_hash, verification\_profile, rule\_set\_version, verifier\_version)$$

Qualquer avanço ou divergência invalida o resultado, retornando `STALE` com `ViolationCode::StaleRevision`.

---

## 7. Determinismo e Hashing Auditável

- **Aritmética discreta**: 100% inteiros (`u32`, `u64`, `i32`). Zero floats, zero relógio de parede.
- **Ordenação determinística de evidências**: Ordenadas por `(frame_start, frame_end, actor_ids, attack_ids, evidence_id)`.
- **`gate_result_hash`**: SHA-256 canônico gerado sobre `CanonicalGateResultForm` (exclui `gate_run_id` e o próprio hash).
- 100 execuções idênticas produzem exatamente o mesmo `GateResultHash` e mesmo veredicto.
