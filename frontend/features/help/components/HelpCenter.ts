export class HelpCenterController {
  public renderHtml(): string {
    return `
      <div class="help-center">
        <div class="card" style="border-left: 4px solid var(--accent);">
          <h2>📖 Central de Ajuda & Guia do Combat Designer</h2>
          <p class="step-desc">
            Aprenda os conceitos fundamentais da ferramenta, o fluxo arquitetural e como tirar o melhor proveito do balanceamento de combate.
          </p>
          <div style="margin-top: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="window.restartGuidedTour()">
              🔄 Reiniciar Tour de Boas-Vindas
            </button>
          </div>
        </div>

        <!-- Invariantes Arquiteturais -->
        <div class="card">
          <h3>🛡️ Princípios e Invariantes do Sistema</h3>
          <div class="step-desc">
            <ul style="margin-left: 20px; line-height: 1.6;">
              <li><strong>O Combat Designer não modifica seu projeto Unity:</strong> Toda a exportação ocorre localmente através de bundles versionados de dados. Suas cenas e assets originais permanecem intocados.</li>
              <li><strong>O LLM não é autoridade mecânica:</strong> O modelo de linguagem (Gemini) sugere ajustes e ajuda a explorar táticas, mas toda a validação de regras e frame data é executada pelo motor determinístico.</li>
              <li><strong>Recomendações não são mutações:</strong> Sugestões do Combat Director são apresentadas para análise do designer; você decide o que aplicar manualmente no seu jogo.</li>
            </ul>
          </div>
        </div>

        <!-- Fluxo de Dados -->
        <div class="card">
          <h3>🔄 Fluxo de Dados do Combate</h3>
          <p class="step-desc">
            O Combat Designer processa informações através do pipeline em camadas:
          </p>
          <div class="pipeline-help-flow">
            <div class="help-step">
              <strong>1. Unity / Imported Data</strong>
              <p>Extração dos ScriptableObjects de ataques, hitboxes e janelas de cancelamento via script C#.</p>
            </div>
            <div class="help-step">
              <strong>2. Modelo Canônico Universal</strong>
              <p>Conversão para modelo determinístico de clock de frames discreto, imune a variações de hardware.</p>
            </div>
            <div class="help-step">
              <strong>3. Grafo de Conhecimento</strong>
              <p>Mapeamento de relações de ataque por personagem e caminhos viáveis de cancelamento.</p>
            </div>
            <div class="help-step">
              <strong>4. Simulação & Validação Mecânica</strong>
              <p>Execução em Rust verificando integridade de frames, caixas de colisão e loops.</p>
            </div>
            <div class="help-step">
              <strong>5. Combat Director (IA)</strong>
              <p>Identificação de anomalias, frame traps abusivos e propostas de balanceamento.</p>
            </div>
          </div>
        </div>

        <!-- Glossário de Termos -->
        <div class="card">
          <h3>📚 Glossário de Combate</h3>
          <div class="glossary-grid">
            <div class="glossary-item">
              <strong>Startup:</strong>
              <p>Quantidade de frames decorridos desde o início do golpe até o primeiro frame ativo de dano.</p>
            </div>
            <div class="glossary-item">
              <strong>Active:</strong>
              <p>Frames durante os quais a hitbox está ligada e pode causar dano ao oponente.</p>
            </div>
            <div class="glossary-item">
              <strong>Recovery:</strong>
              <p>Frames após a fase ativa em que o personagem se recupera e fica vulnerável a contra-ataques.</p>
            </div>
            <div class="glossary-item">
              <strong>Cancel Window:</strong>
              <p>Intervalo exato de frames em que um golpe pode ser interrompido para iniciar outro golpe da sequência.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
