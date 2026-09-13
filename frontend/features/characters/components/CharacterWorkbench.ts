export interface CharacterItem {
  id: string;
  name: string;
  display_name?: string;
  archetype?: string;
  base_health?: number;
  attacks_count?: number;
  combos_count?: number;
}

export interface CharacterWorkbenchProps {
  characters: CharacterItem[];
  selectedCharacterId?: string;
  onSelectCharacter?: (id: string) => void;
  onCreateCharacter?: (data: any) => void;
}

export class CharacterWorkbenchController {
  constructor(private props: CharacterWorkbenchProps) {}

  public renderHtml(): string {
    const { characters, selectedCharacterId } = this.props;

    const cardsHtml =
      characters.length === 0
        ? `
        <div class="empty-state-box">
          <div class="empty-icon">🥋</div>
          <h3>Nenhum personagem cadastrado</h3>
          <p>Cadastre personagens ou importe golpes com a tag de personagem da sua engine.</p>
          <button class="btn btn-primary" onclick="window.promptNewCharacter()">➕ Cadastrar Personagem</button>
        </div>
      `
        : characters
            .map((c) => {
              const isSelected = c.id === selectedCharacterId;
              return `
          <div class="character-card ${isSelected ? "selected" : ""}" onclick="window.selectCharacter('${c.id}')">
            <div class="char-avatar">🥋</div>
            <div class="char-info">
              <h4 class="char-name">${escapeHtml(c.display_name || c.name)}</h4>
              <span class="char-slug">${escapeHtml(c.id)}</span>
              <div class="char-meta">
                <span class="badge badge-info">${escapeHtml(c.archetype || "Geral")}</span>
                <span>${c.attacks_count ?? 0} golpes</span>
                <span>${c.combos_count ?? 0} combos</span>
              </div>
            </div>
          </div>
        `;
            })
            .join("");

    return `
      <div class="character-workbench">
        <div class="workbench-header">
          <div>
            <h3>Personagens do Projeto (${characters.length})</h3>
            <p class="text-dim">Gerencie os combatentes do seu jogo e a associação de golpes.</p>
          </div>
          <button class="btn btn-primary" onclick="window.promptNewCharacter()">
            ➕ Novo Personagem
          </button>
        </div>

        <div class="characters-list-grid">
          ${cardsHtml}
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
