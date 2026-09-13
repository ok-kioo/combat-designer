# SPEC 05 — Combat Analysis & Diagnostics

**Status**: CANONICAL SPECIFICATION (TARGET ARCHITECTURE)  
**Domain Module**: `engine/src/analysis` (Rust) & `backend/src/modules/combat/domain/entity/analysis.types.ts`  
**Application Port**: `backend/src/modules/combat/domain/repository/combat-analysis-port.ts`  
**Application Use Case**: `backend/src/modules/combat/service/analyze-combat.ts`  
**FIC**: `.harness/docs/feature-impacts/spec-05-combat-analysis.yaml`  

---

## 1. Architectural Role & Responsibilities

O **Combat Analysis & Diagnostics** é o motor de avaliação qualitativa e diagnósticos mecânicos do Combat Designer.

Sua responsabilidade é inspecionar execuções do **Deterministic Combat Simulator** (`SimulationResult`) e projeções estruturais do modelo canônico, identificando propriedades emergentes de combate como loops infinitos, janelas de reação insuficientes (stun lock), picos de dano descalibrados (burst/DPS) e quebras de integridade de guarda.

### Princípio Fundamental: Análise Informa, Não Bloqueia
```text
                    ┌→ Combo Search
SimulationResult ───┼→ Combat Analysis ──→ Findings + Evidence ──→ Combat Director ──→ Recommendations
                    ├→ Diagnostics
                    └→ Comparison
```

- **Responde**: `"WHAT IS OBSERVED IN THIS COMBAT TIMELINE?"`
- **Não é um Gate**: Não decide aprovação, não impede visualização de dados e não muta assets de jogo.
- **Não possui vereditos de aprovação**: Não emite `PASS`, `FAIL`, `BLOCKED` ou `APPROVED`. Essas semânticas pertencem exclusivamente ao **harness de desenvolvimento** para aceitação de código.
- **Não depende de autorização de mutação**: A análise emite `Findings` e `Diagnostics` estruturados com evidências frame a frame para subsidiar as recomendações do Combat Director.

---

## 2. Contratos de Domínio: Findings & Diagnostics

### 2.1 Modelo de Finding

```typescript
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  id: string;
  workspace_id: string;
  type: FindingType;
  severity: Severity;
  subject: string;                     // Identificador do ataque, ator ou combo analisado
  title: string;                       // Descrição humana objetiva do achado
  explanation: string;                 // Diagnóstico mecânico detalhado
  evidence: Evidence[];                // Provas determinísticas frame a frame
  simulation_refs: string[];           // Hashes de estado da simulação correlacionados
  confidence: Confidence;
  created_at: string;
}
```

### 2.2 Tipos de Finding Canônicos (`FindingType`)

1. **`INFINITE_STUN_LOOP`**: Ciclo fechado na máquina de estados de combate sem janela de escape ou custo de recursos viável.
2. **`STUN_LOCK`**: Cadeia de ataques em que o defensor possui janela de reação inferior ao limiar mínimo de frames configurado para o arquétipo.
3. **`RESOURCE_SAFETY`**: Sequência que gera vantagem infinita de estamina/recurso sem consumo proporcional ou com geração líquida positiva inadequada.
4. **`MAX_SUSTAINED_DPS`**: Janela deslizante (sliding window normalizada a 60fps) onde a taxa de dano supera os limites arquiteturais do personagem.
5. **`MAX_BURST`**: Dano contíguo ininterrupto ultrapassando o teto de burst damage estabelecido.
6. **`MAX_JUGGLE`**: Duração contínua de frames em estado airborne/juggle sem possibilidade de recuperação aérea (tech roll / air recovery).
7. **`CANCEL_VALIDITY`**: Transição de ataque acionada fora da janela canônica de cancelamento (`FrameWindow`).
8. **`PROVENANCE_REQUIRED`**: Parâmetro de combate derivado de fonte não rastreada ou sem proveniência canônica verificada.
9. **`ZERO_RISK_ATTACK`**: Ataque de alta efetividade ou dano executado com total invulnerabilidade e recuperação nula ou impunível.
10. **`GUARD_INTEGRITY`**: Mecânica de quebra de guarda sem opções táticas prévias de evasão pelo defensor.
11. **`NO_COUNTERPLAY`**: Ataque cuja recuperação pós-hit não deixa janela acionável de punição ou contra-ataque.
12. **`SIMULATION_INTEGRITY`**: Inconsistência estrutural no log ou no hash determinístico da simulação.

### 2.3 Estrutura de Evidência Determinística (`Evidence`)

```typescript
export interface Evidence {
  evidence_id: string;
  kind: string;
  frame_start: number;
  frame_end: number;
  actor_ids: string[];
  attack_ids: string[];
  event_ids: number[];
  state_fingerprints: string[];
  simulation_state_hash: string;
  threshold: number;
  observed: number;
  cycle_states?: string[];
  observed_reaction_window_frames?: number;
  observed_dps?: number;
  observed_burst?: number;
  observed_juggle_frames?: number;
  details: string;
}
```

---

## 3. Status de Execução da Análise (`AnalysisStatus`)

Uma execução de análise diagnóstica retorna um `AnalysisResult` com status estritamente informacional:

```text
COMPLETED       - Análise concluída com sucesso; findings e métricas disponíveis.
INCONCLUSIVE    - Evidências insuficientes na simulação para provar ou refutar o diagnóstico.
BUDGET_EXCEEDED - Espaço de busca (ciclos/estados) ultrapassou o orçamento computacional alocado.
STALE           - O resultado foi calculado contra uma revisão ou snapshot anterior do modelo.
ERROR           - Falha inesperada de execução ou inconsistência de payload.
```

> [!IMPORTANT]
> **Proibição de Vereditos de Aceitação no Runtime**:
> `PASS`, `FAIL`, `BLOCKED` e `APPROVED` **NÃO** são valores válidos para `AnalysisStatus`. Qualquer semântica de aprovação binária pertence exclusivamente ao harness de desenvolvimento (`.harness/skills/analysis/validate-feature-mechanics.md`).

---

## 4. Orçamento Computacional (`AnalysisBudget`) & Determinismo

A análise mecânica respeita restrições estritas de recursos para evitar loops infinitos de busca combinatória:

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `max_events_to_analyze` | 10.000 | Quantidade máxima de eventos do log inspecionados |
| `max_states_explored` | 10.000 | Número máximo de estados avaliados na busca |
| `max_cycles_checked` | 5.000 | Limite de busca em grafo de ciclos (Tarjan SCC) |
| `max_analysis_steps` | 50.000 | Teto de passos operacionais do motor de análise |
| `max_evidence_items` | 500 | Limite de itens de evidência coletados |

Se qualquer limite for atingido, a análise encerra retornando `AnalysisStatus::BudgetExceeded` acompanhado das evidências e diagnósticos parciais levantados até a interrupção.

### Garantias de Determinismo
- **Aritmética inteira pura**: Utiliza exclusivamente inteiros (`u32`, `u64`, `i32`). Nenhum ponto flutuante é utilizado.
- **Ordenação canônica de evidências**: Ordenação lexicográfica estrita por `(frame_start, frame_end, actor_ids, attack_ids, evidence_id)`.

---

## 5. Port Boundary na Clean Architecture

```typescript
export interface CombatAnalysisPort {
  analyze(
    request: AnalysisRequest,
    simulation: SimulationOutput
  ): Promise<AnalysisResult>;
}
```

---

## 6. Code Divergence Registry (`MUST_REMOVE_NOW`)

> [!WARNING]
> O código-fonte histórico implementou esta capacidade sob um conceito inadequado de **"Mechanical Gate"** com semântica de aprovação de runtime. Esses contratos foram escalados para `MUST_REMOVE_NOW` e devem ser substituídos ou desconectados do runtime:
>
> | Contrato/Arquivo Legado | Papel Histórico | Ação nesta Execução |
> |---|---|---|
> | `MechanicalGatePort` | Interface de aprovação runtime | Substituir por `CombatAnalysisPort` |
> | `GateResult` / `GateVerdict` | DTO e enum de veredito com `PASS/FAIL/BLOCKED` | Substituir por `AnalysisResult` / `AnalysisStatus` |
> | `engine/src/verification/verdict.rs` | Agregação de veredito de aprovação | Migrar algoritmos úteis; remover do fluxo de produto |
> | `engine/src/verification/rules/*.rs` | Implementação de regras G01–G11 | Preservar algoritmos como avaliadores de `Finding` |
> | `backend/src/modules/combat/service/verify-combat.ts` | Caso de uso que delegava ao Gate | Substituir por `analyzeCombatUseCase` |
> | `compute_gate_result_hash` | Hash de aprovação do Gate | Desconectar do runtime do produto |
