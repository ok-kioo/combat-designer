/**
 * Combat Designer — Interactive Browser Workbench UI
 *
 * Single-page HTML/CSS/JS client served by ApiServer at GET / and GET /app.
 * Allows game designers to interactively:
 * 1. Browse and filter the Attack Catalog with frame data
 * 2. Select attacks into the LLM context envelope
 * 3. Run deterministic simulations and Mechanical Gate checks
 * 4. Review, approve, and apply ChangeSets
 * 5. Chat with the Combat Director LLM (Gemini API with function calling)
 */

export function renderWorkbenchHtml(defaultWorkspaceId = "ws-default"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Combat Designer Workbench</title>
  <style>
    :root {
      --bg: #0f1117;
      --bg-surface: #181b24;
      --bg-card: #202430;
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
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand h1 { font-size: 1.15rem; font-weight: 700; color: #fff; }
    .status-badges {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .badge {
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-live { background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-llm { background: rgba(79, 141, 245, 0.2); color: var(--accent); border: 1px solid var(--accent); }
    .badge-mock { background: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .ws-selector {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
    }
    .ws-input {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.85rem;
    }

    nav.tab-nav {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      padding: 0 24px;
      gap: 8px;
      flex-shrink: 0;
    }
    .tab-btn {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-dim);
      padding: 10px 16px;
      font-size: 0.9rem;
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
      overflow: hidden;
    }

    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Cards & Tables */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card h3 { font-size: 1rem; margin-bottom: 12px; color: #fff; display: flex; justify-content: space-between; align-items: center; }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--bg-surface); border: 1px solid var(--border); color: var(--text); }
    .btn-secondary:hover { background: var(--border); }
    .btn-danger { background: var(--danger); }
    .btn-success { background: var(--success); }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: rgba(255, 255, 255, 0.02);
      color: var(--text-dim);
      font-weight: 600;
    }
    tr:hover td { background: rgba(255, 255, 255, 0.015); }
    tr.selected td { background: rgba(79, 141, 245, 0.1); }

    /* Chat UI */
    .chat-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chat-context-bar {
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      padding: 8px 16px;
      font-size: 0.75rem;
      color: var(--text-dim);
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .chat-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 90%;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.88rem;
      line-height: 1.45;
    }
    .message.user {
      align-self: flex-end;
      background: var(--accent);
      color: #fff;
    }
    .message.assistant {
      align-self: flex-start;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .tool-chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      margin-top: 6px;
      font-family: var(--mono);
    }
    .tool-chip .verdict-pass { color: var(--success); font-weight: bold; }
    .tool-chip .verdict-fail { color: var(--danger); font-weight: bold; }

    .chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      background: var(--bg-surface);
      display: flex;
      gap: 8px;
    }
    .chat-input {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 0.88rem;
      font-family: var(--font);
    }
    .chat-input:focus { outline: 1px solid var(--accent); }

    .quick-prompts {
      display: flex;
      gap: 6px;
      padding: 8px 16px;
      overflow-x: auto;
      background: rgba(0,0,0,0.15);
    }
    .prompt-chip {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 0.72rem;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      cursor: pointer;
    }
    .prompt-chip:hover { color: var(--text); border-color: var(--accent); }

    pre.code-block {
      background: #08090d;
      padding: 10px;
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 0.78rem;
      overflow-x: auto;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>⚔️ Combat Designer</h1>
      <div class="status-badges">
        <span class="badge badge-live">API Online</span>
        <span id="llm-badge" class="badge badge-llm">Gemini Ready</span>
      </div>
    </div>
    <div class="ws-selector">
      <span>Workspace:</span>
      <input type="text" id="ws-input" class="ws-input" value="${defaultWorkspaceId}">
      <button class="btn btn-secondary" onclick="refreshAll()">Reload</button>
    </div>
  </header>

  <nav class="tab-nav">
    <button class="tab-btn active" onclick="switchTab('catalog')">1. Attack Catalog</button>
    <button class="tab-btn" onclick="switchTab('workbench')">2. Simulation & Gate</button>
    <button class="tab-btn" onclick="switchTab('changesets')">3. ChangeSets</button>
    <button class="tab-btn" onclick="switchTab('api')">4. API Explorer</button>
  </nav>

  <main class="content">
    <div class="left-panel">
      <!-- 1. Attack Catalog -->
      <div id="tab-catalog" class="tab-content active">
        <div class="card">
          <h3>
            <span>Attacks in Workspace (<span id="attack-count">0</span>)</span>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="catalog-search" class="ws-input" placeholder="Search by name/tag..." oninput="filterAttacks()">
              <button class="btn btn-secondary" onclick="seedSampleAttacks()">Seed Samples</button>
            </div>
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
            Check attacks to select them as context for the Combat Director LLM in the right panel.
          </p>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">Select</th>
                <th>Name / ID</th>
                <th>Startup</th>
                <th>Active</th>
                <th>Recovery</th>
                <th>Total</th>
                <th>Damage</th>
                <th>Cancel Window</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody id="attacks-tbody">
              <tr><td colspan="9" style="text-align: center; color: var(--text-dim);">Loading attacks...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. Simulation & Gate -->
      <div id="tab-workbench" class="tab-content">
        <div class="card">
          <h3>Deterministic Simulation</h3>
          <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: center;">
            <label style="font-size: 0.85rem;">Scenario ID:</label>
            <input type="text" id="sim-scenario" class="ws-input" value="sc_preview">
            <label style="font-size: 0.85rem;">Max Frames:</label>
            <input type="number" id="sim-frames" class="ws-input" value="120" style="width: 80px;">
            <button class="btn" onclick="runSimulation()">Run Simulator</button>
          </div>
          <div id="sim-result" style="display: none;">
            <div style="font-size: 0.85rem; margin-bottom: 8px;">
              Result: <strong id="sim-status" style="color: var(--success);">COMPLETED</strong> across <span id="sim-total-frames">120</span> frames.
              Hash: <code id="sim-hash" style="font-family: var(--mono); color: var(--accent);"></code>
            </div>
            <pre class="code-block" id="sim-events"></pre>
          </div>
        </div>

        <div class="card">
          <h3>Mechanical Gate Verification</h3>
          <p style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
            Validates safety invariants: sustained DPS limit, burst damage, infinite loops, and reaction windows.
          </p>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <button class="btn btn-success" onclick="runVerification('strict')">Verify (Strict Profile)</button>
            <button class="btn btn-secondary" onclick="runVerification('fail_test')">Test Invariant Failure</button>
          </div>
          <div id="gate-result" style="display: none;">
            <div style="font-size: 0.95rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
              Verdict: <span id="gate-verdict-badge" class="badge badge-live">PASS</span>
              Gate Run ID: <code id="gate-run-id" style="font-family: var(--mono); font-size: 0.8rem;"></code>
            </div>
            <pre class="code-block" id="gate-details"></pre>
          </div>
        </div>
      </div>

      <!-- 3. ChangeSets -->
      <div id="tab-changesets" class="tab-content">
        <div class="card">
          <h3>ChangeSet Proposals</h3>
          <p style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px;">
            Workflow: LLM proposes &rarr; Gate verifies &rarr; Human approves &rarr; Applies.
          </p>
          <div id="changesets-container">
            <p style="color: var(--text-dim); font-size: 0.85rem;">No active changesets in workspace.</p>
          </div>
        </div>
      </div>

      <!-- 4. API Explorer -->
      <div id="tab-api" class="tab-content">
        <div class="card">
          <h3>REST Endpoints Overview</h3>
          <table>
            <thead>
              <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><code>GET</code></td><td><code>/health</code></td><td>Liveness & Readiness probe</td></tr>
              <tr><td><code>GET</code></td><td><code>/api/workspaces/:ws/attacks</code></td><td>Attack catalog & cancel windows</td></tr>
              <tr><td><code>POST</code></td><td><code>/api/workspaces/:ws/simulations</code></td><td>Deterministic simulation execution</td></tr>
              <tr><td><code>POST</code></td><td><code>/api/workspaces/:ws/verifications</code></td><td>Mechanical Gate safety verification</td></tr>
              <tr><td><code>GET</code></td><td><code>/api/workspaces/:ws/changesets</code></td><td>List ChangeSet proposals</td></tr>
              <tr><td><code>POST</code></td><td><code>/api/workspaces/:ws/chat</code></td><td>Director Chat (Gemini LLM Orchestrator)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Right Panel: Director Chat -->
    <div class="chat-panel">
      <div class="chat-header">
        <div style="font-weight: 700; font-size: 0.95rem;">💬 Combat Director</div>
        <span style="font-size: 0.75rem; color: var(--text-dim);">Gemini Function Calling</span>
      </div>

      <div class="chat-context-bar">
        <span>Selected Attacks: <strong id="ctx-selected-count">0</strong></span>
        <span>Snapshot: <code id="ctx-snapshot-hash">snap-default</code></span>
      </div>

      <div class="quick-prompts">
        <span class="prompt-chip" onclick="usePrompt('Buff light punch damage from 25 to 35')">⚡ Buff punch damage</span>
        <span class="prompt-chip" onclick="usePrompt('Simulate combat scenario for 120 frames')">🎮 Run 120f simulation</span>
        <span class="prompt-chip" onclick="usePrompt('Search for all attacks with cancel windows')">🔍 Search cancel windows</span>
      </div>

      <div class="chat-messages" id="chat-messages">
        <div class="message assistant">
          Hello! I am the <strong>Combat Director</strong>.
          You can ask me to search attacks, simulate frames, verify safety via the Mechanical Gate, or propose changes.
          How can I help tune your combat mechanics?
        </div>
      </div>

      <div class="chat-input-area">
        <input type="text" id="chat-input" class="chat-input" placeholder="Type a instruction to the Combat Director..." onkeydown="if(event.key==='Enter') sendChatMessage()">
        <button class="btn" onclick="sendChatMessage()">Send</button>
      </div>
    </div>
  </main>

  <script>
    let currentWorkspace = "${defaultWorkspaceId}";
    let loadedAttacks = [];
    let selectedAttackIds = [];

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector(\`button[onclick="switchTab('\${tabId}')"]\`)?.classList.add('active');
      document.getElementById('tab-' + tabId)?.classList.add('active');
    }

    function getWs() {
      return document.getElementById('ws-input').value.trim() || currentWorkspace;
    }

    async function refreshAll() {
      currentWorkspace = getWs();
      await loadAttacks();
      await loadChangeSets();
    }

    async function loadAttacks() {
      try {
        const res = await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/attacks\`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        loadedAttacks = data.attacks || [];
        renderAttacksTable(loadedAttacks);
      } catch (err) {
        document.getElementById('attacks-tbody').innerHTML = \`<tr><td colspan="9" style="color: var(--danger);">Failed to load attacks: \${err.message}</td></tr>\`;
      }
    }

    function renderAttacksTable(attacks) {
      document.getElementById('attack-count').innerText = attacks.length;
      if (attacks.length === 0) {
        document.getElementById('attacks-tbody').innerHTML = \`<tr><td colspan="9" style="text-align: center; color: var(--text-dim);">No attacks found. Click "Seed Samples" above.</td></tr>\`;
        return;
      }
      const rows = attacks.map(a => {
        const isSelected = selectedAttackIds.includes(a.attack_id);
        const total = (a.startup_frames || 0) + (a.active_frames || 0) + (a.recovery_frames || 0);
        const cancel = a.cancel_window ? \`\${a.cancel_window.start_frame}f-\${a.cancel_window.end_frame}f\` : '-';
        return \`
          <tr class="\${isSelected ? 'selected' : ''}">
            <td><input type="checkbox" \${isSelected ? 'checked' : ''} onchange="toggleSelectAttack('\${a.attack_id}')"></td>
            <td><strong>\${a.name}</strong> <span style="font-size: 0.72rem; color: var(--text-dim); display: block;">\${a.attack_id}</span></td>
            <td>\${a.startup_frames}f</td>
            <td>\${a.active_frames}f</td>
            <td>\${a.recovery_frames}f</td>
            <td>\${total}f</td>
            <td><strong>\${a.damage}</strong></td>
            <td>\${cancel}</td>
            <td>\${(a.tags || []).join(', ') || '-'}</td>
          </tr>
        \`;
      }).join('');
      document.getElementById('attacks-tbody').innerHTML = rows;
    }

    function toggleSelectAttack(id) {
      if (selectedAttackIds.includes(id)) {
        selectedAttackIds = selectedAttackIds.filter(x => x !== id);
      } else {
        selectedAttackIds.push(id);
      }
      document.getElementById('ctx-selected-count').innerText = selectedAttackIds.length;
      renderAttacksTable(loadedAttacks);
    }

    function filterAttacks() {
      const q = document.getElementById('catalog-search').value.toLowerCase();
      const filtered = loadedAttacks.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.attack_id.toLowerCase().includes(q) ||
        (a.tags || []).some(t => t.toLowerCase().includes(q))
      );
      renderAttacksTable(filtered);
    }

    async function seedSampleAttacks() {
      // Sends a chat prompt to seed proposals, or directly uses Director
      usePrompt("Propose adding light punch and heavy kick with balanced frame data");
      sendChatMessage();
    }

    async function runSimulation() {
      const scenarioId = document.getElementById('sim-scenario').value || "sc_preview";
      const maxFrames = parseInt(document.getElementById('sim-frames').value, 10) || 120;
      try {
        const res = await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/simulations\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario_id: scenarioId, config: { budget: { max_frames: maxFrames } } })
        });
        const data = await res.json();
        const sim = data.simulation;
        document.getElementById('sim-result').style.display = 'block';
        document.getElementById('sim-status').innerText = sim.status || 'COMPLETED';
        document.getElementById('sim-total-frames').innerText = sim.total_frames || maxFrames;
        document.getElementById('sim-hash').innerText = sim.final_state_hash || 'hash_deterministic';
        document.getElementById('sim-events').innerText = JSON.stringify(sim.events || [], null, 2);
      } catch (err) {
        alert('Simulation failed: ' + err.message);
      }
    }

    async function runVerification(mode) {
      try {
        const res = await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/verifications\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verification_request: {
              should_fail: mode === 'fail_test',
              verification_profile: mode === 'fail_test' ? 'strict' : 'strict'
            }
          })
        });
        const data = await res.json();
        const gate = data.gate_result;
        document.getElementById('gate-result').style.display = 'block';
        const badge = document.getElementById('gate-verdict-badge');
        badge.innerText = gate.verdict;
        badge.className = 'badge ' + (gate.verdict === 'PASS' ? 'badge-live' : 'btn-danger');
        document.getElementById('gate-run-id').innerText = gate.gate_run_id;
        document.getElementById('gate-details').innerText = JSON.stringify(gate, null, 2);
      } catch (err) {
        alert('Verification failed: ' + err.message);
      }
    }

    async function loadChangeSets() {
      try {
        const res = await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/changesets\`);
        const data = await res.json();
        const list = data.changesets || [];
        const container = document.getElementById('changesets-container');
        if (list.length === 0) {
          container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem;">No active changesets in workspace.</p>';
          return;
        }
        container.innerHTML = list.map(cs => \`
          <div class="card" style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong>\${cs.changeset_id}</strong>
              <span class="badge badge-llm">\${cs.status}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">
              Proposed by: <code>\${cs.proposed_by}</code> | Base: \${cs.base_revision} &rarr; Target: \${cs.target_revision}
            </div>
            <pre class="code-block">\${JSON.stringify(cs.mutations, null, 2)}</pre>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              \${cs.status === 'proposed' ? \`<button class="btn btn-success" onclick="approveChangeSet('\${cs.changeset_id}')">Approve (Human)</button>\` : ''}
              \${cs.status === 'approved' ? \`<button class="btn" onclick="applyChangeSet('\${cs.changeset_id}')">Apply to Production</button>\` : ''}
              \${cs.status !== 'applied' && cs.status !== 'withdrawn' ? \`<button class="btn btn-danger" onclick="withdrawChangeSet('\${cs.changeset_id}')">Withdraw</button>\` : ''}
            </div>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Failed to load changesets:', err);
      }
    }

    async function approveChangeSet(id) {
      await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/changesets/\${encodeURIComponent(id)}/approve\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver_id: 'human_lead' })
      });
      await loadChangeSets();
    }

    async function applyChangeSet(id) {
      await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/changesets/\${encodeURIComponent(id)}/apply\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate_result: { verdict: 'PASS' } })
      });
      await loadChangeSets();
      await loadAttacks();
    }

    async function withdrawChangeSet(id) {
      await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/changesets/\${encodeURIComponent(id)}/withdraw\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Withdrawn by designer' })
      });
      await loadChangeSets();
    }

    function usePrompt(text) {
      document.getElementById('chat-input').value = text;
      document.getElementById('chat-input').focus();
    }

    async function sendChatMessage() {
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (!text) return;

      const chatContainer = document.getElementById('chat-messages');
      // Append user message
      chatContainer.innerHTML += \`<div class="message user">\${text}</div>\`;
      input.value = '';
      chatContainer.scrollTop = chatContainer.scrollHeight;

      // Loading bubble
      const loadingId = 'loading-' + Date.now();
      chatContainer.innerHTML += \`<div id="\${loadingId}" class="message assistant" style="color: var(--text-dim);">Thinking & orchestrating tools...</div>\`;
      chatContainer.scrollTop = chatContainer.scrollHeight;

      try {
        const res = await fetch(\`/api/workspaces/\${encodeURIComponent(getWs())}/chat\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            context: {
              snapshot_hash: "snap-default",
              selected_attack_ids: selectedAttackIds
            }
          })
        });
        const data = await res.json();
        document.getElementById(loadingId)?.remove();

        let toolHtml = '';
        if (data.tool_calls && data.tool_calls.length > 0) {
          toolHtml = data.tool_calls.map(tc => \`
            <div class="tool-chip">
              ⚡ <strong>\${tc.tool_id}</strong>
              \${tc.output?.verdict ? \`<span class="verdict-\${tc.output.verdict.toLowerCase()}">[\${tc.output.verdict}]</span>\` : ''}
              <pre class="code-block" style="margin-top: 4px;">\${JSON.stringify(tc.output, null, 2)}</pre>
            </div>
          \`).join('');
        }

        chatContainer.innerHTML += \`
          <div class="message assistant">
            <div>\${data.reply || 'Operation executed.'}</div>
            \${toolHtml}
          </div>
        \`;
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // If a proposal was made, refresh changesets tab
        if (data.proposed_changeset) {
          await loadChangeSets();
        }
      } catch (err) {
        document.getElementById(loadingId)?.remove();
        chatContainer.innerHTML += \`<div class="message assistant" style="color: var(--danger);">Error: \${err.message}</div>\`;
      }
    }

    // Initial load
    window.addEventListener('DOMContentLoaded', () => {
      refreshAll();
    });
  </script>
</body>
</html>
`;
}
