export interface FindingItem {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  attack_ids?: string[];
}

export interface RecommendationItem {
  id: string;
  title: string;
  description: string;
  suggested_action: string;
  evidence_summary: string;
}

export interface AnalysisItem {
  id: string;
  subject: string;
  findings: FindingItem[];
  recommendations: RecommendationItem[];
  created_at: string;
}

export interface AnalysisWorkbenchProps {
  analyses: AnalysisItem[];
  onRequestAnalysis?: () => void;
}

export class AnalysisWorkbenchController {
  constructor(private props: AnalysisWorkbenchProps) {}

  public renderHtml(): string {
    const { analyses } = this.props;

    const analysesListHtml =
      analyses.length === 0
        ? `<div class="empty-state-box">
            <div class="empty-icon">📊</div>
            <h3>Nenhuma análise realizada</h3>
            <p>Peça ao Combat Director para analisar os golpes e combos deste projeto em busca de infinitos, frame traps ou problemas de balanceamento.</p>
            <button class="btn btn-primary" onclick="window.triggerDirectorAnalysis()">🤖 Solicitar Análise ao Diretor</button>
          </div>`
        : analyses
            .map((an) => {
              const findingsHtml =
                an.findings.length > 0
                  ? an.findings
                      .map(
                        (f) => `
                    <div class="finding-row severity-${f.severity}">
                      <span class="badge badge-${f.severity === "critical" || f.severity === "high" ? "danger" : "warning"}">
                        ${f.severity.toUpperCase()}
                      </span>
                      <div>
                        <strong>${escapeHtml(f.title)}</strong>
                        <p class="finding-desc">${escapeHtml(f.description)}</p>
                      </div>
                    </div>
                  `
                      )
                      .join("")
                  : `<div class="text-dim" style="font-size:0.8rem;">Nenhum problema detectado.</div>`;

              const recsHtml =
                an.recommendations.length > 0
                  ? an.recommendations
                      .map(
                        (r) => `
                    <div class="rec-row">
                      <strong>💡 ${escapeHtml(r.title)}</strong>
                      <p>${escapeHtml(r.description)}</p>
                      <div class="rec-action-badge">
                        Ação: ${escapeHtml(r.suggested_action)}
                      </div>
                    </div>
                  `
                      )
                      .join("")
                  : `<div class="text-dim" style="font-size:0.8rem;">Sem recomendações adicionais.</div>`;

              return `
          <div class="analysis-card card">
            <div class="analysis-header">
              <h4>📊 ${escapeHtml(an.subject)}</h4>
              <span class="text-dim" style="font-size:0.75rem;">${formatDate(an.created_at)}</span>
            </div>

            <div style="margin-top: 10px;">
              <h5 style="font-size: 0.85rem; margin-bottom: 6px;">Constatações (Findings):</h5>
              <div class="findings-list">${findingsHtml}</div>
            </div>

            <div style="margin-top: 14px;">
              <h5 style="font-size: 0.85rem; margin-bottom: 6px;">Recomendações do Diretor:</h5>
              <div class="recs-list">${recsHtml}</div>
            </div>
          </div>
        `;
            })
            .join("\n");

    return `
      <div class="analysis-workbench">
        <div class="workbench-header">
          <div>
            <h3>Análises e Recomendações de Combate</h3>
            <p class="text-dim">Relatórios gerados pelo Combat Director com base em regras e simulações.</p>
          </div>
          <button class="btn btn-primary" onclick="window.triggerDirectorAnalysis()">
            🤖 Nova Análise
          </button>
        </div>

        <div class="analyses-feed">
          ${analysesListHtml}
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  } catch (_) {
    return "";
  }
}
