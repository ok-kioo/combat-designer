export interface LandingPageProps {
  isAuthenticated: boolean;
  username?: string;
  onNavigateLogin?: () => void;
  onNavigateRegister?: () => void;
  onNavigateProjects?: () => void;
}

export class LandingPageController {
  constructor(private props: LandingPageProps) {}

  public renderHtml(): string {
    const ctaHtml = this.props.isAuthenticated
      ? `
        <div class="landing-cta-group">
          <button class="btn btn-success btn-lg" onclick="window.navigateToProjects()">
            🚀 Ir para Meus Projetos (${this.props.username || "Usuário"})
          </button>
        </div>
      `
      : `
        <div class="landing-cta-group">
          <button class="btn btn-success btn-lg" onclick="window.showAuthModal('register')">
            ✨ Criar Conta Grátis
          </button>
          <button class="btn btn-secondary btn-lg" onclick="window.showAuthModal('login')">
            🔑 Fazer Login
          </button>
        </div>
      `;

    return `
      <div class="landing-container">
        <!-- Hero Section -->
        <section class="landing-hero">
          <div class="landing-badge">Versão 2.0 • Foco em Combate & Game Design</div>
          <h1 class="landing-title">
            Balanceamento, Combos e Análise de Combate para Game Designers
          </h1>
          <p class="landing-subtitle">
            Importe dados canônicos da Unity, analise janelas de frame data, descubra combos viáveis e receba recomendações do Combat Director sem alterar seu projeto da engine.
          </p>
          ${ctaHtml}
        </section>

        <!-- Value Pillars -->
        <section class="landing-pillars">
          <div class="pillar-card">
            <div class="pillar-icon">🥋</div>
            <h3>Personagens & Golpes Canônicos</h3>
            <p>
              Organize seus combatentes com arquétipos e frame data exata. Cada golpe possui dados determinísticos de startup, active, recovery e hitboxes.
            </p>
          </div>

          <div class="pillar-card">
            <div class="pillar-icon">🔗</div>
            <h3>Construtor e Validação de Combos</h3>
            <p>
              Crie sequências de golpes com validação mecânica rigorosa. Encontre cancel windows reais e garanta que os combos pertençam estritamente ao mesmo personagem.
            </p>
          </div>

          <div class="pillar-card">
            <div class="pillar-icon">🤖</div>
            <h3>Combat Director com IA</h3>
            <p>
              Obtenha análises profundas, identificação de infinitos ou loops abusivos e recomendações de balanceamento fundamentadas em evidências de simulação.
            </p>
          </div>
        </section>

        <!-- Pipeline Banner -->
        <section class="landing-pipeline">
          <h3>Como Funciona o Fluxo Arquitetural</h3>
          <div class="pipeline-steps">
            <div class="step-item">
              <div class="step-num">1</div>
              <div class="step-txt"><strong>Unity Export</strong><br>ScriptableObjects da engine</div>
            </div>
            <div class="step-arrow">➔</div>
            <div class="step-item">
              <div class="step-num">2</div>
              <div class="step-txt"><strong>Modelo Canônico</strong><br>Frame clock discreto</div>
            </div>
            <div class="step-arrow">➔</div>
            <div class="step-item">
              <div class="step-num">3</div>
              <div class="step-txt"><strong>Simulação & Combos</strong><br>Validação de cancelamento</div>
            </div>
            <div class="step-arrow">➔</div>
            <div class="step-item">
              <div class="step-num">4</div>
              <div class="step-txt"><strong>Combat Director</strong><br>Análise e Recomendações</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }
}
