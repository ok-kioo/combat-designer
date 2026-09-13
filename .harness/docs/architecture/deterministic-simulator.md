# Deterministic Simulator Architecture (SPEC 04)

## 1. Architectural Role & Invariants

O **Deterministic Simulator** (`engine/combat-simulation`) é o motor de execução discreto, determinístico e puro do ecossistema Combat Designer.

### Separação de Responsabilidades:
```text
LLM           = INTENTION    ("Quero aumentar o startup do slash")
MCP Gateway   = CAN I?       (Verifica autenticação, capabilities, workspace isolation, policy)
MCP Server    = TRANSLATE    (Mapeia tools MCP para casos de uso da Application)
Application   = IS VALID?    (Valida integridade do input, autorização de workspace, orquestra portas)
Simulator     = WHAT HAPPENS?(Calcula o resultado mecânico frame a frame)
Analysis (Spec 05) = WHAT IS OBSERVED? (Diagnostica problemas mecânicos e emite Findings)
Director (Spec 13) = WHAT TO DO?  (Formula recomendações consultivas)
```

### Invariantes Fundamentais:
1. **Pergunta Única: "WHAT HAPPENS?"**:
   - O Simulator **nunca** decide se um resultado é válido, seguro ou aceitável. Ele apenas relata o que acontece. A interpretação analítica e diagnóstica pertence à **Combat Analysis (SPEC 05)** e ao **Combat Director (SPEC 13)**.
2. **Determinismo Estrito**:
   - 100 execuções do mesmo cenário de combate com os mesmos inputs produzem byte-a-byte o mesmo `StateHash` e a mesma sequência de eventos.
3. **Tempo Discreto via `FrameClock`**:
   - Nenhum uso de tempo de relógio do sistema (`Instant::now`, `SystemTime::now`, `chrono`).
   - Nenhum uso de `std::thread::sleep` ou concorrência não determinística.
   - Avanço de frames é monotônico e inteiro (`u32`).
4. **Aritmética Inteira**:
   - Toda lógica de jogo (frames, dano, recursos, permille) utiliza tipos inteiros (`u32`, `i32`, `u64`). Nenhum ponto flutuante (`f32`/`f64`) é permitido no pipeline de simulação.
5. **Orçamento Finito (`ExecutionBudget`)**:
   - Todo cenário possui limites para `max_frames`, `max_events`, `max_state_transitions` e `max_entities`.
   - O esgotamento do orçamento retorna explicitamente `BUDGET_EXCEEDED` com o estado parcial. **Nunca** é tratado como `PASS` ou `ERROR` não tratado.

---

## 2. Ciclo de Execução de Frame (Contrato de 10 Etapas)

A cada frame da simulação, o motor executa obrigatoriamente a seguinte sequência contratual:

```text
 1. apply_inputs
    │  (Filtra comandos do frame, ordena deterministamente por actor_id, valida can_act e recursos)
    ▼
 2. update_timers
    │  (Decrementa stun_timer e block_timer; avança frame_in_attack de ataques ativos)
    ▼
 3. resolve_hitboxes
    │  (Identifica hitboxes ativas no frame atual contra entidades inimigas)
    ▼
 4. resolve_block
    │  (Para cada colisão, verifica estado de bloqueio; golpes tipo throw ignoram bloco)
    ▼
 5. apply_hit_reactions
    │  (Aplica chip_damage/blockstun ou full damage/hitstun/guard break/launch)
    ▼
 6. resolve_cancel_windows
    │  (Abre janelas de cancel elegíveis [OnHit, OnBlock, Always]; executa transições encadeadas)
    ▼
 7. update_resources
    │  (Atualiza contabilidade de recursos de combate de todos os atores)
    ▼
 8. resolve_state_transitions
    │  (Avança estados de ataque: startup -> active -> recovery -> neutral / hitstun / blockstun)
    ▼
 9. finalize_event_batch
    │  (Ordena todos os eventos do frame pelo critério determinístico de desempate)
    ▼
10. snapshot
       (Captura o snapshot imutável do frame e calcula o StateHash acumulado)
```

---

## 3. Contrato Determinístico de Desempate (Tie-Breaking)

Quando múltiplos atores ou múltiplos ataques geram eventos no mesmo frame, a ordenação de eventos é estritamente definida pela quádrupla lexicográfica:

$$\text{EventOrder} = (\text{frame}, \text{actor\_id}, \text{attack\_id}, \text{sequence})$$

- Nenhuma etapa depende de ordem de iteração de tabelas hash ou ordem de chegada em canal assíncrono.
- Coleções utilizam estruturas ordenadas canonicamente (`BTreeMap`, `BTreeSet`, vetores pré-ordenados).

---

## 4. Orçamento de Execução (`ExecutionBudget`)

O `ExecutionBudget` protege a simulação contra loops infinitos, DoS e explosão combinatória:

| Limite | Padrão | Descrição |
|---|---|---|
| `max_frames` | 3.600 | Limite máximo de frames simulados (60s a 60fps) |
| `max_events` | 10.000 | Quantidade máxima de eventos emitidos na simulação |
| `max_state_transitions` | 5.000 | Quantidade máxima de transições de máquina de estados |
| `max_entities` | 32 | Quantidade máxima de entidades combatentes no cenário |

Se qualquer limite for atingido, a execução é interrompida com:
```rust
SimulationStatus::BudgetExceeded { reason: String }
```
Garantindo proteção sem falha catastrófica.

---

## 5. Snapshots e `StateHash`

A cada frame, é gerado um `SimulationSnapshot` contendo:
- `frame`: Número do frame atual;
- `actors`: Dicionário ordenado (`BTreeMap`) de `ActorSnapshot` (vida, guarda, estado de combate, recursos, timers, flags);
- `state_hash`: Digest SHA-256 (64 caracteres hexadecimais) calculado sobre a representação canônica ordenada do snapshot.

### Replay Determinístico (`ReplayRunner`)
O `ReplayRunner` recebe o cenário inicial e os comandos temporizados e reproduz exatamente a simulação, permitindo a verificação de conformidade de execução contra hashes esperados.

---

## 6. Integração com a Clean Architecture (`SimulationPort`)

Na camada de aplicação (`packages/application`), o caso de uso `SimulateCombatUseCase` é completamente desacoplado dos detalhes internos de baixo nível da simulação Rust através da interface de porta:

```typescript
export interface SimulationPort {
  simulate(
    scenario: SimulationScenario,
    config: SimulationConfig
  ): Promise<SimulationOutput>;
}
```

A aplicação valida que o `workspace_id` está autorizado pelo MCP Gateway, verifica invariantes do cenário e delega a execução mecânica à porta.
