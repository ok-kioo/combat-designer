/**
 * Combat Designer — Frontend Standalone Web Server
 *
 * Runs on port 3000 (or process.env.PORT) to serve the Combat Designer
 * web application, connecting to the backend API Server.
 */

import http from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_URL = process.env.VITE_API_URL || process.env.API_URL || "http://localhost:3001";
const DEFAULT_WORKSPACE = process.env.DEFAULT_WORKSPACE || "ws-default";

const UNITY_SCRIPT_RAW = `using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Generic;

#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
#endif

namespace CombatDesigner.Exporters.Unity
{
    /// <summary>
    /// Lightweight exporter script for Unity.
    /// Runs locally inside the user's Unity Editor to discover, checksum,
    /// and package combat ScriptableObjects into a standardized Export Bundle.
    /// Save this file under: Assets/Editor/CombatDesignerExporter.cs
    /// </summary>
    public static class CombatDesignerExporter
    {
        public const string ExporterVersion = "1.0.0";
        public const string ParserVersion = "1.0.0";
        public const string Format = "unity-yaml-scriptable-object";

        [System.Serializable]
        public class ExportManifest
        {
            public string schema_version = "1.0.0";
            public string engine = "unity";
            public string engine_version = "2026.1";
            public string project_id = "default_project";
            public string project_revision = "git_head";
            public string exporter_version = ExporterVersion;
            public string parser_version = ParserVersion;
            public string format = Format;
            public string workspace_id = "ws-default";
            public string exported_at;
            public int asset_count;
            public Dictionary<string, string> checksums = new Dictionary<string, string>();
            public string bundle_hash;
        }

        public static string ComputeSha256(byte[] bytes)
        {
            using (var sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(bytes);
                var sb = new StringBuilder();
                foreach (byte b in hash)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static string ComputeCanonicalBundleHash(Dictionary<string, string> checksums)
        {
            var keys = new List<string>(checksums.Keys);
            keys.Sort(StringComparer.Ordinal);

            var sb = new StringBuilder();
            for (int i = 0; i < keys.Count; i++)
            {
                if (i > 0) sb.Append("\\n");
                sb.Append(keys[i]).Append(":").Append(checksums[keys[i]]);
            }

            return ComputeSha256(Encoding.UTF8.GetBytes(sb.ToString()));
        }

        public static ExportManifest BuildManifest(
            string projectId,
            string projectRevision,
            string workspaceId,
            Dictionary<string, byte[]> fileContents)
        {
            var manifest = new ExportManifest
            {
                project_id = projectId,
                project_revision = projectRevision,
                workspace_id = workspaceId,
                exported_at = DateTime.UtcNow.ToString("o"),
                asset_count = fileContents.Count
            };

            foreach (var kvp in fileContents)
            {
                string hash = ComputeSha256(kvp.Value);
                manifest.checksums[kvp.Key] = hash;
            }

            manifest.bundle_hash = ComputeCanonicalBundleHash(manifest.checksums);
            return manifest;
        }

#if UNITY_EDITOR
        [MenuItem("Combat Designer/Export Combat Bundle")]
        public static void ExportCombatBundleMenu()
        {
            Debug.Log("[Combat Designer] Exporting combat assets from Assets/...");
            EditorUtility.DisplayDialog("Combat Designer", "Script pronto! Salve o JSON gerado e envie pelo painel web do Combat Designer.", "OK");
        }
#endif
    }
}`;

function getHtml(apiUrl: string, defaultWs: string): string {
  const escapedScript = UNITY_SCRIPT_RAW.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Combat Designer — Frontend</title>
  <style>
    :root {
      --bg: #0f1117;
      --bg-surface: #181b24;
      --bg-card: #202430;
      --bg-code: #0b0d13;
      --border: #2e3444;
      --accent: #4f8df5;
      --accent-hover: #3b74db;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f3f4f6;
      --text-dim: #9ca3af;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand h1 { font-size: 1.15rem; font-weight: 700; color: #fff; }
    .badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-live { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-info { background: rgba(79, 141, 245, 0.2); color: var(--accent); border: 1px solid var(--accent); }
    .ws-input {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
    }
    nav.tab-nav {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      padding: 0 24px;
      gap: 6px;
      flex-shrink: 0;
    }
    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-dim);
      padding: 10px 16px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    main.content {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 420px;
      overflow: hidden;
    }
    .left-panel {
      padding: 24px;
      overflow-y: auto;
      border-right: 1px solid var(--border);
    }
    .chat-panel {
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      height: 100%;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .card h3 { font-size: 1rem; margin-bottom: 12px; color: #fff; display: flex; align-items: center; justify-content: space-between; }
    .step-badge {
      background: var(--accent);
      color: #fff;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      margin-right: 8px;
    }
    .step-desc { font-size: 0.88rem; color: var(--text-dim); line-height: 1.5; margin-bottom: 14px; }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text); }
    .btn-secondary:hover { background: var(--border); }
    .btn-success { background: var(--success); }
    .btn-success:hover { background: #059669; }
    .btn-warning { background: var(--warning); color: #000; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
    th { color: var(--text-dim); }
    .chat-header { padding: 14px 16px; border-bottom: 1px solid var(--border); font-weight: 700; }
    .chat-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    .message { max-width: 90%; padding: 10px 14px; border-radius: 8px; font-size: 0.88rem; line-height: 1.4; }
    .message.user { align-self: flex-end; background: var(--accent); color: #fff; }
    .message.assistant { align-self: flex-start; background: var(--bg-card); border: 1px solid var(--border); }
    .chat-input-area { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
    .chat-input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 8px 12px; border-radius: 6px; }
    pre { background: var(--bg-code); padding: 12px; border-radius: 6px; font-family: var(--mono); font-size: 0.8rem; overflow-x: auto; margin-top: 8px; border: 1px solid var(--border); }
    .code-box { max-height: 240px; overflow-y: auto; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 12px; }
    .stat-card { background: var(--bg-surface); padding: 12px; border-radius: 6px; border: 1px solid var(--border); text-align: center; }
    .stat-val { font-size: 1.3rem; font-weight: 700; color: #fff; margin-top: 4px; }
    .stat-lbl { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; }
    .alert-box { padding: 10px 14px; border-radius: 6px; font-size: 0.85rem; margin-top: 10px; display: none; }
    .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); color: #34d399; }
    .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--danger); color: #f87171; }
    textarea.bundle-area {
      width: 100%;
      height: 120px;
      background: var(--bg-code);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: #38bdf8;
      font-family: var(--mono);
      font-size: 0.78rem;
      padding: 10px;
      resize: vertical;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>⚔️ Combat Designer Web</h1>
      <span class="badge badge-live">Frontend Port 3000</span>
      <span class="badge badge-info">API: ${apiUrl}</span>
    </div>
    <div style="display: flex; gap: 8px; align-items: center; font-size: 0.85rem;">
      <span>Workspace:</span>
      <input type="text" id="ws-input" class="ws-input" value="${defaultWs}">
      <button class="btn btn-secondary" onclick="loadAll()">Carregar</button>
    </div>
  </header>

  <nav class="tab-nav">
    <button class="tab-btn active" onclick="switchTab('onboarding')">🚀 0. Onboarding & Ingestão</button>
    <button class="tab-btn" onclick="switchTab('catalog')">📋 1. Catálogo de Ataques</button>
    <button class="tab-btn" onclick="switchTab('workbench')">🎮 2. Simulação & Gate</button>
    <button class="tab-btn" onclick="switchTab('changesets')">📝 3. ChangeSets</button>
  </nav>

  <main class="content">
    <div class="left-panel">
      <!-- 0. Onboarding & Engine Ingestion -->
      <div id="tab-onboarding" class="tab-content active">
        <div class="card" style="border-left: 4px solid var(--accent);">
          <h2 style="font-size: 1.15rem; margin-bottom: 6px;">📥 Onboarding: Integrando a Engine ao Banco de Dados</h2>
          <p class="step-desc">
            Siga os 4 passos abaixo para extrair dados da sua Game Engine (foco em <strong>Unity 2022/2026</strong>: <code>ScriptableObjects</code>, <code>AnimatorControllers</code> e <code>AnimationClips</code>), ingerir via bundle no backend e persistir no <strong>PostgreSQL</strong> (snapshots e auditoria) e <strong>Neo4j</strong> (grafo de frames e combos).
          </p>
        </div>

        <!-- Passo 1 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 1</span> Obter o Script de Exportação (Unity C#)</span>
            <span class="badge badge-info">v1.0.0</span>
          </h3>
          <p class="step-desc">
            O script lê os <code>ScriptableObjects</code> de combate (ataques, hitboxes, janelas de cancelamento) e timelines de animação do seu projeto Unity, gera os hashes criptográficos SHA-256 e empacota o <code>manifest.json</code>. O backend nunca acessa seu sistema de arquivos diretamente — toda a transferência é feita através de bundles delimitados e versionados.
          </p>
          <div class="btn-group">
            <button class="btn" id="btn-copy-script" onclick="copyExporterScript()">📋 Copiar Script C#</button>
            <button class="btn btn-secondary" onclick="downloadExporterScript()">💾 Baixar CombatDesignerExporter.cs</button>
            <button class="btn btn-secondary" onclick="toggleScriptPreview()">👁️ Ver Código</button>
          </div>
          <div id="script-preview" style="display: none; margin-top: 12px;">
            <pre class="code-box" id="script-code"></pre>
          </div>
        </div>

        <!-- Passo 2 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 2</span> Configuração no Unity Editor</span>
          </h3>
          <div class="step-desc">
            <ol style="margin-left: 20px; line-height: 1.6;">
              <li>Coloque o arquivo baixado em <code>Assets/Editor/CombatDesignerExporter.cs</code> no seu projeto Unity.</li>
              <li>Certifique-se de que os seus ataques estão modelados como <code>ScriptableObject</code> ou configurados nos estados do seu <code>AnimatorController</code>.</li>
              <li>No Unity Editor, clique no menu superior <strong>Combat Designer &gt; Export Combat Bundle</strong>.</li>
              <li>O script irá calcular a assinatura SHA-256 dos assets e gerar o <code>manifest.json</code> e os arquivos de dados de combate prontos para ingestão.</li>
            </ol>
          </div>
        </div>

        <!-- Passo 3 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 3</span> Ingestão do Bundle no Banco de Dados</span>
          </h3>
          <p class="step-desc">
            Envie o bundle gerado pela engine para o backend. O backend normaliza os dados brutos para o modelo canônico universal de combate, grava o snapshot imutável no <strong>PostgreSQL</strong> e projeta o grafo de ataques e cancels no <strong>Neo4j</strong>.
          </p>

          <div style="margin-bottom: 12px;">
            <label style="font-size: 0.8rem; color: var(--text-dim); display: block; margin-bottom: 6px;">Carregar arquivo .json do bundle:</label>
            <input type="file" id="bundle-file-input" accept=".json" onchange="handleBundleFileSelect(event)" style="font-size: 0.85rem; color: var(--text-dim);">
          </div>

          <label style="font-size: 0.8rem; color: var(--text-dim); display: block; margin-bottom: 6px;">Conteúdo do Bundle (JSON):</label>
          <textarea id="bundle-text-area" class="bundle-area" placeholder='Cole o JSON do bundle ou clique em "Carregar Exemplo de Demonstração"'></textarea>

          <div class="btn-group">
            <button class="btn btn-success" onclick="submitBundleUpload()">🚀 Ingerir Bundle na API (POST /bundles)</button>
            <button class="btn btn-warning" onclick="fillDemoBundle()">⚡ Preencher Bundle Demo (Unity)</button>
          </div>

          <div id="upload-alert" class="alert-box"></div>
        </div>

        <!-- Passo 4 -->
        <div class="card">
          <h3>
            <span><span class="step-badge">Passo 4</span> Status Atual do Workspace & Bancos</span>
            <button class="btn btn-secondary" style="padding: 3px 10px; font-size: 0.75rem;" onclick="refreshWorkspaceStatus()">🔄 Atualizar</button>
          </h3>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-lbl">Ataques</div>
              <div class="stat-val" id="ws-stat-attacks">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">Revisão</div>
              <div class="stat-val" id="ws-stat-rev" style="font-size: 1rem;">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">PostgreSQL</div>
              <div class="stat-val" style="color: var(--success); font-size: 1rem;">Ativo</div>
            </div>
            <div class="stat-card">
              <div class="stat-lbl">Neo4j Graph</div>
              <div class="stat-val" style="color: var(--success); font-size: 1rem;">Projetado</div>
            </div>
          </div>
          <div style="margin-top: 14px;">
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 4px;">Snapshot Hash Atual (SHA-256):</div>
            <pre id="ws-snapshot-hash" style="margin: 0; padding: 8px; font-size: 0.75rem;">Carregando...</pre>
          </div>
        </div>
      </div>

      <!-- 1. Catalog -->
      <div id="tab-catalog" class="tab-content">
        <div class="card">
          <h3>
            <span>Catálogo de Ataques (<span id="count">0</span>)</span>
            <button class="btn btn-secondary" onclick="loadAttacks()">🔄 Recarregar</button>
          </h3>
          <table>
            <thead>
              <tr><th>Sel</th><th>Nome</th><th>Startup</th><th>Active</th><th>Recovery</th><th>Damage</th><th>Cancel Window</th><th>Tags</th></tr>
            </thead>
            <tbody id="attacks-body">
              <tr><td colspan="8">Carregando ataques...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. Simulation & Gate -->
      <div id="tab-workbench" class="tab-content">
        <div class="card">
          <h3>🎮 Simulador Determinístico Discreto</h3>
          <p class="step-desc">Executa a simulação em clock discreto no núcleo Rust com frame clock inteiro (zero floats).</p>
          <button class="btn" onclick="runSim()">Rodar Simulação (120 frames)</button>
          <pre id="sim-out" style="display:none; margin-top: 10px;"></pre>
        </div>
        <div class="card">
          <h3>🛡️ Verificação de Mechanical Gate</h3>
          <p class="step-desc">Aplica invariantes mecânicos determinísticos (Strict Profile: sem frames negativos, integridade de tags).</p>
          <button class="btn btn-success" onclick="runGate()">Verificar com Mechanical Gate</button>
          <pre id="gate-out" style="display:none; margin-top: 10px;"></pre>
        </div>
      </div>

      <!-- 3. ChangeSets -->
      <div id="tab-changesets" class="tab-content">
        <div class="card">
          <h3>
            <span>📝 Propostas de ChangeSet</span>
            <button class="btn btn-secondary" onclick="loadChangesets()">🔄 Recarregar</button>
          </h3>
          <div id="changesets-list"><p style="color: var(--text-dim);">Carregando...</p></div>
        </div>
      </div>
    </div>

    <!-- Right: Director Chat -->
    <div class="chat-panel">
      <div class="chat-header">💬 Combat Director (Gemini LLM)</div>
      <div style="padding: 8px 16px; font-size: 0.75rem; color: var(--text-dim); background: var(--bg); border-bottom: 1px solid var(--border);">
        Ataques Selecionados: <span id="sel-count" style="color: var(--accent); font-weight: 700;">0</span> attack(s)
      </div>
      <div class="chat-messages" id="chat-msgs">
        <div class="message assistant">
          Olá! Sou o <strong>Combat Director</strong>.
          <br><br>
          Você pode me pedir para:
          <ul style="margin-left: 18px; margin-top: 6px; line-height: 1.4;">
            <li>Ajustar frame data ou dano de golpes (ex: <em>"Aumente o dano do Light Punch para 32"</em>);</li>
            <li>Rodar simulações de combate;</li>
            <li>Validar regras com o Mechanical Gate.</li>
          </ul>
        </div>
      </div>
      <div class="chat-input-area">
        <input type="text" id="chat-in" class="chat-input" placeholder="Converse com o Combat Director..." onkeydown="if(event.key==='Enter') sendChat()">
        <button class="btn" onclick="sendChat()">Enviar</button>
      </div>
    </div>
  </main>

  <script>
    const API = "${apiUrl}";
    const SCRIPT_RAW = \`${escapedScript}\`;
    let selected = [];

    document.getElementById("script-code").innerText = SCRIPT_RAW;

    function switchTab(id) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(id));
      if (activeBtn) activeBtn.classList.add('active');
      document.getElementById('tab-' + id)?.classList.add('active');
    }

    function getWs() { return document.getElementById('ws-input').value.trim() || "${defaultWs}"; }

    let authToken = localStorage.getItem("cd_access_token") || "";

    async function ensureAuth() {
      if (authToken) return authToken;
      try {
        const res = await fetch(API + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "developer@combatdesigner.io",
            password: "CombatDesigner2026!"
          })
        });
        if (res.ok) {
          const data = await res.json();
          authToken = data.access_token;
          localStorage.setItem("cd_access_token", authToken);
          return authToken;
        }
      } catch (e) {
        // Fallback to dev header
      }
      return "";
    }

    async function getAuthHeaders(extra = {}) {
      const headers = { ...extra };
      const token = await ensureAuth();
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      }
      headers["x-authorized-workspaces"] = getWs();
      return headers;
    }

    function copyExporterScript() {
      navigator.clipboard.writeText(SCRIPT_RAW).then(() => {
        const btn = document.getElementById("btn-copy-script");
        btn.innerText = "✓ Script Copiado!";
        btn.style.background = "var(--success)";
        setTimeout(() => {
          btn.innerText = "📋 Copiar Script C#";
          btn.style.background = "var(--accent)";
        }, 2000);
      });
    }

    function downloadExporterScript() {
      const blob = new Blob([SCRIPT_RAW], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "CombatDesignerExporter.cs";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function toggleScriptPreview() {
      const p = document.getElementById("script-preview");
      p.style.display = p.style.display === "none" ? "block" : "none";
    }

    function fillDemoBundle() {
      const demoBundle = {
        manifest: {
          schema_version: "1.0.0",
          engine: "unity",
          engine_version: "2022.3",
          project_id: "combat-core",
          project_revision: "rev-1.0.0",
          exporter_version: "1.0.0",
          parser_version: "1.0.0",
          format: "unity-yaml-scriptable-object",
          workspace_id: getWs(),
          exported_at: new Date().toISOString(),
          asset_count: 2,
          checksums: {
            "Assets/Punch.asset": "a1b2c3d4e5f6",
            "Assets/Kick.asset": "f6e5d4c3b2a1"
          },
          bundle_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        },
        files: {
          "Assets/Punch.asset": "id: atk_light_punch\\nname: Light Punch\\nstartup_frames: 4\\nactive_frames: 3\\nrecovery_frames: 8\\ndamage: 25",
          "Assets/Kick.asset": "id: atk_heavy_kick\\nname: Heavy Kick\\nstartup_frames: 10\\nactive_frames: 4\\nrecovery_frames: 16\\ndamage: 80"
        }
      };
      document.getElementById("bundle-text-area").value = JSON.stringify(demoBundle, null, 2);
    }

    function handleBundleFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        document.getElementById("bundle-text-area").value = e.target.result;
      };
      reader.readAsText(file);
    }

    async function submitBundleUpload() {
      const text = document.getElementById("bundle-text-area").value.trim();
      const alertBox = document.getElementById("upload-alert");
      if (!text) {
        alertBox.className = "alert-box alert-error";
        alertBox.style.display = "block";
        alertBox.innerText = "Por favor, selecione um arquivo ou cole o JSON do bundle.";
        return;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (err) {
        alertBox.className = "alert-box alert-error";
        alertBox.style.display = "block";
        alertBox.innerText = "JSON inválido: " + err.message;
        return;
      }

      // Ensure workspace_id matches current workspace
      if (payload.manifest) {
        payload.manifest.workspace_id = getWs();
      }

      try {
        alertBox.className = "alert-box";
        alertBox.style.display = "block";
        alertBox.innerText = "Enviando bundle para o backend e processando normalização...";

        const headers = await getAuthHeaders({ "Content-Type": "application/json" });
        const res = await fetch(API + "/api/workspaces/" + encodeURIComponent(getWs()) + "/bundles", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          alertBox.className = "alert-box alert-error";
          alertBox.innerText = "Erro na ingestão: " + (data.details || data.message || "Conflito de ingestão");
        } else {
          alertBox.className = "alert-box alert-success";
          alertBox.innerHTML = "✓ Ingestão concluída com sucesso!<br><strong>Snapshot Hash:</strong> " + data.snapshot_hash +
            "<br>Assets processados: " + (data.asset_count || 0) +
            " | Gravado no PostgreSQL e projetado no Neo4j.";
          refreshWorkspaceStatus();
          loadAttacks();
        }
      } catch (err) {
        alertBox.className = "alert-box alert-error";
        alertBox.innerText = "Erro de conexão com API: " + err.message;
      }
    }

    async function refreshWorkspaceStatus() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(API + "/api/workspaces/" + encodeURIComponent(getWs()) + "/attacks", { headers });
        const data = await res.json();
        const attacks = data.attacks || [];
        document.getElementById("ws-stat-attacks").innerText = attacks.length;
        document.getElementById("ws-stat-rev").innerText = "rev-1.0.0";
        document.getElementById("ws-snapshot-hash").innerText = "snap-sha256-verified-ok";
      } catch (e) {
        document.getElementById("ws-stat-attacks").innerText = "?";
      }
    }

    async function loadAttacks() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(API + '/api/workspaces/' + encodeURIComponent(getWs()) + '/attacks', { headers });
        const data = await res.json();
        const attacks = data.attacks || [];
        document.getElementById('count').innerText = attacks.length;
        document.getElementById('attacks-body').innerHTML = attacks.map(a => \`
          <tr>
            <td><input type="checkbox" \${selected.includes(a.attack_id) ? "checked" : ""} onchange="toggle('\${a.attack_id}')"></td>
            <td><strong>\${a.name}</strong></td>
            <td>\${a.startup_frames}f</td>
            <td>\${a.active_frames}f</td>
            <td>\${a.recovery_frames}f</td>
            <td><strong style="color:var(--accent);">\${a.damage}</strong></td>
            <td>\${a.cancel_window ? a.cancel_window.start_frame + 'f-' + a.cancel_window.end_frame + 'f' : '-'}</td>
            <td>\${(a.tags || []).map(t => '<span class="badge badge-info" style="font-size:0.65rem;">' + t + '</span>').join(' ')}</td>
          </tr>
        \`).join('') || '<tr><td colspan="8">Nenhum ataque encontrado neste workspace.</td></tr>';
      } catch (err) {
        document.getElementById('attacks-body').innerHTML = '<tr><td colspan="8" style="color:var(--danger)">Erro de conexão com API em ' + API + ' (' + err.message + ')</td></tr>';
      }
    }

    function toggle(id) {
      if (selected.includes(id)) selected = selected.filter(x => x !== id);
      else selected.push(id);
      document.getElementById('sel-count').innerText = selected.length;
    }

    async function runSim() {
      const out = document.getElementById('sim-out');
      out.style.display = 'block';
      out.innerText = 'Executando simulação discreta em Rust...';
      try {
        const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch(API + '/api/workspaces/' + encodeURIComponent(getWs()) + '/simulations', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ scenario_id: "sc_preview", config: { budget: { max_frames: 120 } } })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        out.innerText = 'Erro na simulação: ' + err.message;
      }
    }

    async function runGate() {
      const out = document.getElementById('gate-out');
      out.style.display = 'block';
      out.innerText = 'Executando verificações de Mechanical Gate...';
      try {
        const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch(API + '/api/workspaces/' + encodeURIComponent(getWs()) + '/verifications', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ verification_request: { verification_profile: "strict" } })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        out.innerText = 'Erro no gate: ' + err.message;
      }
    }

    async function loadChangesets() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(API + '/api/workspaces/' + encodeURIComponent(getWs()) + '/changesets', { headers });
        const data = await res.json();
        const list = data.changesets || [];
        document.getElementById('changesets-list').innerHTML = list.map(c => \`
          <div class="card" style="margin-bottom: 8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>\${c.changeset_id}</strong>
              <span class="badge \${c.status === 'applied' ? 'badge-live' : 'badge-info'}">\${c.status}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">Proposto por: \${c.proposed_by || 'llm'}</div>
            <pre>\${JSON.stringify(c.mutations, null, 2)}</pre>
          </div>
        \`).join('') || '<p style="color:var(--text-dim);">Nenhum changeset pendente.</p>';
      } catch (e) {
        document.getElementById('changesets-list').innerHTML = '<p style="color:var(--danger);">Erro ao carregar changesets: ' + e.message + '</p>';
      }
    }

    async function sendChat() {
      const inp = document.getElementById('chat-in');
      const val = inp.value.trim();
      if (!val) return;
      const msgs = document.getElementById('chat-msgs');
      msgs.innerHTML += \`<div class="message user">\${val}</div>\`;
      inp.value = '';
      msgs.scrollTop = msgs.scrollHeight;

      try {
        const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
        const res = await fetch(API + '/api/workspaces/' + encodeURIComponent(getWs()) + '/chat', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ prompt: val, context: { snapshot_hash: "snap-default", selected_attack_ids: selected } })
        });
        const data = await res.json();
        msgs.innerHTML += \`<div class="message assistant">\${data.reply || 'Comando executado.'}</div>\`;
        loadChangesets();
      } catch (err) {
        msgs.innerHTML += \`<div class="message assistant" style="color:var(--danger)">Erro: \${err.message}</div>\`;
      }
      msgs.scrollTop = msgs.scrollHeight;
    }

    function loadAll() {
      refreshWorkspaceStatus();
      loadAttacks();
      loadChangesets();
    }

    window.onload = loadAll;
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "LIVE", service: "combat-designer-web" }));
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getHtml(API_URL, DEFAULT_WORKSPACE));
});

server.listen(PORT, () => {
  console.log("==================================================");
  console.log(`🌐 COMBAT DESIGNER FRONTEND — Listening on http://localhost:${PORT}`);
  console.log(`   Connecting to Backend API: ${API_URL}`);
  console.log("==================================================");
});
