import { describe, it, expect } from "vitest";
import { LandingPageController } from "../features/landing/components/LandingPage.js";
import { WorkspaceDashboardController } from "../features/project-workspace/components/WorkspaceDashboard.js";
import { WorkspaceOverviewController } from "../features/project-workspace/components/WorkspaceOverview.js";

describe("SPEC 14 — Frontend UX, Navigation & Workspaces (UX.WS.1 to UX.WS.7)", () => {
  it("UX.WS.1: Landing page renders value pillars and public CTA when unauthenticated", () => {
    const landing = new LandingPageController({ isAuthenticated: false });
    const html = landing.renderHtml();

    expect(html).toContain("Balanceamento, Combos e Análise de Combate");
    expect(html).toContain("Personagens & Golpes Canônicos");
    expect(html).toContain("Construtor e Validação de Combos");
    expect(html).toContain("Combat Director com IA");
    expect(html).toContain("Criar Conta Grátis");
    expect(html).toContain("Fazer Login");
  });

  it("UX.WS.2: Landing page renders 'Ir para Meus Projetos' CTA when authenticated", () => {
    const landing = new LandingPageController({ isAuthenticated: true, username: "LeadDesigner" });
    const html = landing.renderHtml();

    expect(html).toContain("Ir para Meus Projetos (LeadDesigner)");
  });

  it("UX.WS.3: Workspace Dashboard displays projects with KPIs and engine metadata", () => {
    const dashboard = new WorkspaceDashboardController({
      workspaces: [
        {
          id: "ws-alpha",
          name: "Alpha Strike",
          description: "2D Fighting game",
          engine: "Unity",
          engine_version: "2026.1",
          status: "active",
          characters_count: 4,
          attacks_count: 32,
          combos_count: 8,
          updated_at: new Date().toISOString(),
        },
      ],
    });

    const html = dashboard.renderHtml();
    expect(html).toContain("Alpha Strike");
    expect(html).toContain("Unity 2026.1");
    expect(html).toContain("Personagens");
    expect(html).toContain("Golpes");
    expect(html).toContain("Combos");
    expect(html).toContain("Abrir Workbench");
    expect(html).toContain("Arquivar");
  });

  it("UX.WS.4: Workspace Dashboard renders empty state when user has 0 workspaces", () => {
    const dashboard = new WorkspaceDashboardController({ workspaces: [] });
    const html = dashboard.renderHtml();

    expect(html).toContain("Nenhum projeto encontrado");
    expect(html).toContain("Criar Primeiro Projeto");
  });

  it("UX.WS.5: Workspace Overview tab renders real domain KPIs and quick actions", () => {
    const overview = new WorkspaceOverviewController({
      workspace: {
        id: "ws-alpha",
        name: "Alpha Strike",
        status: "active",
      },
      has_data: true,
      kpis: {
        characters_count: 3,
        attacks_count: 24,
        unassigned_attacks_count: 2,
        combos_count: 5,
        user_combos_count: 3,
        ai_combos_count: 2,
        analyses_count: 1,
        mechanical_issues_count: 0,
      },
      recent_activity: [
        { id: "act-1", label: "Combo criado: Light Punch into Shoryuken", timestamp: new Date().toISOString() },
      ],
      recent_recommendations: [
        { id: "rec-1", title: "Aumentar recovery de LP", description: "Vantagem excessiva", suggested_action: "+2 frames" },
      ],
    });

    const html = overview.renderHtml();
    expect(html).toContain("Alpha Strike");
    expect(html).toContain("Personagens");
    expect(html).toContain("Golpes Canônicos");
    expect(html).toContain("Combos Cadastrados");
    expect(html).toContain("Análises de Combate");
    expect(html).toContain("Aumentar recovery de LP");
    expect(html).toContain("Light Punch into Shoryuken");
  });

  it("UX.WS.6: Workspace Overview renders guided empty state when project has no imported data", () => {
    const overview = new WorkspaceOverviewController({
      workspace: { id: "ws-empty", name: "Novo Jogo", status: "active" },
      has_data: false,
      kpis: {
        characters_count: 0,
        attacks_count: 0,
        unassigned_attacks_count: 0,
        combos_count: 0,
        user_combos_count: 0,
        ai_combos_count: 0,
        analyses_count: 0,
        mechanical_issues_count: 0,
      },
      recent_activity: [],
      recent_recommendations: [],
    });

    const html = overview.renderHtml();
    expect(html).toContain("Bem-vindo ao projeto");
    expect(html).toContain("Importar Dados da Engine Unity");
    expect(html).toContain("Ver Guia de Início Rápido");
  });

  it("UX.WS.7: ChangeSets and raw database infrastructure terms are strictly absent from views", () => {
    const landing = new LandingPageController({ isAuthenticated: false }).renderHtml();
    const dashboard = new WorkspaceDashboardController({ workspaces: [] }).renderHtml();

    // Verify absence of ChangeSet review panels and raw database leaks
    expect(landing).not.toContain("ChangeSet Review");
    expect(landing).not.toContain("PostgreSQL");
    expect(landing).not.toContain("Neo4j");
    expect(dashboard).not.toContain("ChangeSet");
    expect(dashboard).not.toContain("PostgreSQL");
  });
});
