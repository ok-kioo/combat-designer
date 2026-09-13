export interface ImportTabProps {
  exporterScriptRaw: string;
  onUploadBundle?: (bundle: any) => void;
}

export class ImportTabController {
  constructor(private props: ImportTabProps) {}

  public renderHtml(): string {
    return `
      <div class="import-tab-view">
        <div class="card" style="border-left: 4px solid var(--accent);">
          <h2>📥 Importar Dados da Game Engine</h2>
          <p class="step-desc">
            Siga o fluxo abaixo para exportar os dados de combate (golpes, animações, cancel windows e hitboxes) da sua engine Unity e carregá-los no Combat Designer.
          </p>
        </div>

        <!-- Passo 1 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 1</span> Obter o Script de Exportação (Unity C#)</span>
            <span class="badge badge-info">v1.0.0</span>
          </h3>
          <p class="step-desc">
            O script lê os <code>ScriptableObjects</code> de ataque do seu projeto Unity e empacota os dados em um formato padronizado pronto para importação.
          </p>
          <div class="btn-group">
            <button class="btn" id="btn-copy-script" onclick="window.copyExporterScript()">📋 Copiar Script C#</button>
            <button class="btn btn-secondary" onclick="window.downloadExporterScript()">💾 Baixar CombatDesignerExporter.cs</button>
            <button class="btn btn-secondary" onclick="window.toggleScriptPreview()">👁️ Ver Código</button>
          </div>
          <div id="script-preview" style="display: none; margin-top: 12px;">
            <pre class="code-box" id="script-code"></pre>
          </div>
        </div>

        <!-- Passo 2 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 2</span> Execução no Unity Editor</span>
          </h3>
          <div class="step-desc">
            <ol style="margin-left: 20px; line-height: 1.6;">
              <li>Salve o arquivo em <code>Assets/Editor/CombatDesignerExporter.cs</code> no seu projeto Unity.</li>
              <li>No Unity Editor, acesse o menu superior <strong>Combat Designer &gt; Export Combat Bundle</strong>.</li>
              <li>O script irá gerar o arquivo JSON contendo o manifesto e os assets de combate do jogo.</li>
            </ol>
          </div>
        </div>

        <!-- Passo 3 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 3</span> Carregar Bundle de Combate</span>
          </h3>
          <p class="step-desc">
            Selecione o arquivo gerado pela Unity ou cole o conteúdo JSON abaixo para processar a importação:
          </p>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 0.8rem; color: var(--text-dim); display: block; margin-bottom: 6px;">Arquivo .json do bundle:</label>
            <input type="file" id="bundle-file-input" accept=".json" onchange="window.handleBundleFileSelect(event)" style="font-size: 0.85rem; color: var(--text-dim);">
          </div>

          <label style="font-size: 0.8rem; color: var(--text-dim); display: block; margin-bottom: 6px;">Conteúdo do Bundle (JSON):</label>
          <textarea id="bundle-text-area" class="bundle-area" placeholder='Cole o JSON gerado ou clique em "Preencher Dados de Demonstração"'></textarea>

          <div class="btn-group">
            <button class="btn btn-success" onclick="window.submitBundleUpload()">🚀 Processar Importação de Dados</button>
            <button class="btn btn-warning" onclick="window.fillDemoBundle()">⚡ Preencher Dados de Demonstração (Unity)</button>
          </div>

          <div id="upload-alert" class="alert-box"></div>
        </div>
      </div>
    `;
  }
}
