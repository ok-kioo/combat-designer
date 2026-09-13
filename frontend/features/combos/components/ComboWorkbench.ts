export interface ComboItem {
  id: string;
  name: string;
  character_id: string;
  source: "USER_CREATED" | "AI_DISCOVERED" | "IMPORTED";
  steps: Array<{ index: number; attack_id: string; condition?: string }>;
  notes?: string;
  evaluation?: {
    damage: number;
    hits: number;
    duration: number;
    is_stale: boolean;
  };
}

export interface ComboWorkbenchProps {
  combos: ComboItem[];
  characters: Array<{ id: string; name: string }>;
  attacks: Array<{ id: string; name: string; character_id?: string | null; startup: number; damage: number }>;
  onSaveCombo?: (combo: any) => void;
  onDeleteCombo?: (id: string) => void;
}

export class ComboWorkbenchController {
  constructor(private props: ComboWorkbenchProps) {}

  public renderHtml(): string {
    const { combos, characters, attacks } = this.props;

    const charOptions = characters
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");

    const combosListHtml =
      combos.length === 0
        ? `<div class="text-dim" style="padding: 16px 0;">Nenhum combo salvo ainda. Use o Construtor abaixo ou peça ao Combat Director para descobrir combos viáveis!</div>`
        : combos
            .map((c) => {
              const charName = characters.find((ch) => ch.id === c.character_id)?.name || c.character_id;
              const evalText = c.evaluation
                ? `<span class="combo-eval-badge ${c.evaluation.is_stale ? "stale" : ""}">
                    ${c.evaluation.damage} dano • ${c.evaluation.hits} hits • ${c.evaluation.duration}f
                    ${c.evaluation.is_stale ? " (⚠️ Avaliação Desatualizada)" : ""}
                  </span>`
                : `<span class="text-dim" style="font-size:0.75rem;">Não avaliado</span>`;

              const sourceBadge =
                c.source === "AI_DISCOVERED"
                  ? `<span class="badge badge-info">🤖 Descoberto por IA</span>`
                  : `<span class="badge badge-live">👤 Criado por Designer</span>`;

              return `
          <div class="combo-card" data-id="${c.id}">
            <div class="combo-card-header">
              <div>
                <strong>${escapeHtml(c.name)}</strong>
                <span class="combo-char-pill">🥋 ${escapeHtml(charName)}</span>
                ${sourceBadge}
              </div>
              <button class="btn btn-secondary btn-sm" onclick="window.deleteCombo('${c.id}')">🗑️</button>
            </div>
            <div class="combo-steps-flow">
              ${c.steps
                .map((s, idx) => {
                  const atk = attacks.find((a) => a.id === s.attack_id);
                  const atkLabel = atk ? atk.name : s.attack_id;
                  return `
                    <span class="step-chip">
                      ${idx + 1}. ${escapeHtml(atkLabel)}
                      ${s.condition && s.condition !== "always" ? `<small class="cond">(${s.condition})</small>` : ""}
                    </span>
                    ${idx < c.steps.length - 1 ? '<span class="flow-arrow">➔</span>' : ""}
                  `;
                })
                .join("")}
            </div>
            <div class="combo-card-footer">
              ${evalText}
            </div>
          </div>
        `;
            })
            .join("\n");

    return `
      <div class="combo-workbench">
        <!-- Construtor de Combo -->
        <div class="card combo-builder-card">
          <h3>🛠️ Construtor de Combo (Combo Builder)</h3>
          <p class="step-desc">
            Crie sequências de golpes validadas pelo motor de combate. Todos os golpes do combo devem pertencer rigorosamente ao mesmo personagem.
          </p>

          <form id="combo-builder-form" onsubmit="event.preventDefault(); window.submitComboBuilder();">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <label style="font-size:0.8rem; color:var(--text-dim); display:block; margin-bottom:4px;">Nome do Combo:</label>
                <input type="text" id="builder-combo-name" class="chat-input" style="width:100%;" placeholder="Ex: Light confirm into Super" required>
              </div>
              <div>
                <label style="font-size:0.8rem; color:var(--text-dim); display:block; margin-bottom:4px;">Personagem:</label>
                <select id="builder-combo-char" class="ws-select" style="width:100%;" onchange="window.onBuilderCharacterChange(this.value)">
                  <option value="">Selecione o Personagem...</option>
                  ${charOptions}
                </select>
              </div>
            </div>

            <!-- Steps Builder Container -->
            <div style="margin-bottom: 12px;">
              <label style="font-size:0.8rem; color:var(--text-dim); display:block; margin-bottom:6px;">Sequência de Passos (Passo a Passo):</label>
              <div id="builder-steps-container" style="display: flex; flex-direction: column; gap: 8px;">
                <!-- Dinamicamente preenchido -->
              </div>
              <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.addBuilderStep()">
                ➕ Adicionar Golpe à Sequência
              </button>
            </div>

            <div id="builder-alert" class="alert-box"></div>

            <div class="btn-group">
              <button type="submit" class="btn btn-success">
                💾 Salvar e Validar Combo
              </button>
            </div>
          </form>
        </div>

        <!-- Lista de Combos Salvos -->
        <div class="card">
          <h3>
            <span>📋 Combos do Projeto (<span id="combos-count">${combos.length}</span>)</span>
            <button class="btn btn-secondary btn-sm" onclick="window.refreshCombos()">🔄 Atualizar</button>
          </h3>
          <div class="combos-list">
            ${combosListHtml}
          </div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
