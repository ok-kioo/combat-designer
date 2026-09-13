import { describe, it, expect } from "vitest";
import { ImportTabController } from "../features/ingestion/components/ImportTab.js";
import { HelpCenterController } from "../features/help/components/HelpCenter.js";

describe("SPEC 14 — Onboarding, Import Tab & Help Center (ONBOARD.1 to ONBOARD.5)", () => {
  it("ONBOARD.1: Dedicated Import tab renders 3 clear steps for Unity integration", () => {
    const importTab = new ImportTabController({
      exporterScriptRaw: "public class CombatDesignerExporter {}",
    });
    const html = importTab.renderHtml();

    expect(html).toContain("Passo 1");
    expect(html).toContain("Passo 2");
    expect(html).toContain("Passo 3");
    expect(html).toContain("Script de Exportação (Unity C#)");
    expect(html).toContain("Execução no Unity Editor");
    expect(html).toContain("Carregar Bundle de Combate");
  });

  it("ONBOARD.2: Import tab strictly removes internal infrastructure mentions (PostgreSQL, Neo4j, raw cryptographic hash)", () => {
    const importTab = new ImportTabController({
      exporterScriptRaw: "public class CombatDesignerExporter {}",
    });
    const html = importTab.renderHtml();

    // Verify infrastructure isolation from user-facing UI
    expect(html).not.toContain("PostgreSQL");
    expect(html).not.toContain("Neo4j");
    expect(html).not.toContain("SHA-256");
  });

  it("ONBOARD.3: Permanent Help Center tab documents core architectural invariants", () => {
    const help = new HelpCenterController();
    const html = help.renderHtml();

    expect(html).toContain("Central de Ajuda & Guia do Combat Designer");
    expect(html).toContain("O Combat Designer não modifica seu projeto Unity");
    expect(html).toContain("O LLM não é autoridade mecânica");
    expect(html).toContain("Recomendações não são mutações");
  });

  it("ONBOARD.4: Help Center provides complete frame data glossary", () => {
    const help = new HelpCenterController();
    const html = help.renderHtml();

    expect(html).toContain("Startup");
    expect(html).toContain("Active");
    expect(html).toContain("Recovery");
    expect(html).toContain("Cancel Window");
  });

  it("ONBOARD.5: Help Center includes guided tour restart action", () => {
    const help = new HelpCenterController();
    const html = help.renderHtml();

    expect(html).toContain("Reiniciar Tour de Boas-Vindas");
  });
});
