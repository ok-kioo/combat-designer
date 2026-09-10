/**
 * SkillRegistry — Registers specialized agent skills and enforces tool allowlists.
 *
 * Each Skill defines:
 * - skill_id
 * - purpose
 * - allowed_intents
 * - required_context
 * - allowed_tools
 * - input_schema
 * - output_schema
 * - validation_requirements
 * - failure_behavior
 *
 * Invariant: No Skill has implicit access to all tools.
 * Invariant: combat_apply_change DOES NOT EXIST in any allowlist.
 */

import type { ChatIntent, PublicActivity } from "../domain/entity/chat.js";

export interface SkillDefinition {
  skill_id: string;
  purpose: string;
  allowed_intents: ChatIntent[];
  required_context: string[];
  allowed_tools: string[];
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  validation_requirements: string[];
  failure_behavior: string;
  public_labels: Record<string, string>;
}

export class SkillRegistry {
  private readonly skills: Map<string, SkillDefinition> = new Map();

  constructor() {
    this.registerDefaultSkills();
  }

  public getSkill(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  public resolveSkillForIntent(intent: ChatIntent): SkillDefinition {
    for (const skill of this.skills.values()) {
      if (skill.allowed_intents.includes(intent)) {
        return skill;
      }
    }
    // Default fallback to analyze_attack
    return this.skills.get("analyze_attack")!;
  }

  public isToolAllowed(skillId: string, toolName: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return false;
    }
    return skill.allowed_tools.includes(toolName);
  }

  public createPublicActivity(
    skillId: string,
    toolName: string,
    status: PublicActivity["status"]
  ): PublicActivity {
    const skill = this.skills.get(skillId);
    const label =
      skill?.public_labels[toolName] ||
      this.getDefaultPublicLabel(toolName);

    return {
      activity_id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      status,
      label,
    };
  }

  private getDefaultPublicLabel(toolName: string): string {
    switch (toolName) {
      case "combat_search":
        return "Consultando dados de ataque...";
      case "combat_get_attack":
        return "Consultando frame data...";
      case "combat_simulate":
        return "Simulando cenário de combate...";
      case "combat_verify":
        return "Validando resultado mecânico...";
      case "combat_propose_change":
        return "Formulando proposta de balanceamento...";
      case "combat_impact_analysis":
        return "Analisando impacto de alterações...";
      case "combat_explain_gate":
        return "Examinando veredito mecânico...";
      case "list_scenarios":
        return "Carregando cenários disponíveis...";
      default:
        return "Processando consulta de combate...";
    }
  }

  private registerDefaultSkills(): void {
    // 1. analyze_attack
    this.register({
      skill_id: "analyze_attack",
      purpose: "Inspect attack frame data, hitboxes, cancel windows, and stats",
      allowed_intents: ["COMBAT_ANALYSIS", "COMBAT_SEARCH"],
      required_context: ["selected_attacks", "canonical_snapshot"],
      allowed_tools: ["combat_search", "combat_get_attack", "combat_impact_analysis"],
      input_schema: { attack_id: "string" },
      output_schema: { frame_data: "object", cancel_windows: "array" },
      validation_requirements: ["require_canonical_provenance"],
      failure_behavior: "return_not_found",
      public_labels: {
        combat_search: "Consultando frame data e ataques...",
        combat_get_attack: "Verificando frame data do ataque...",
        combat_impact_analysis: "Avaliando dependências do golpe...",
      },
    });

    // 2. analyze_balance
    this.register({
      skill_id: "analyze_balance",
      purpose: "Evaluate risk/reward, damage scaling, counterplay, DPS and burst",
      allowed_intents: ["BALANCE_ANALYSIS", "SIMULATION"],
      required_context: ["selected_attacks", "simulation_budget"],
      allowed_tools: ["combat_search", "combat_simulate", "combat_verify"],
      input_schema: { attack_ids: "array", target_metrics: "object" },
      output_schema: { dps_analysis: "object", counterplay_window: "number" },
      validation_requirements: ["require_simulation_evidence"],
      failure_behavior: "flag_inconclusive",
      public_labels: {
        combat_search: "Buscando parâmetros do golpe...",
        combat_simulate: "Simulando impacto no balanceamento...",
        combat_verify: "Validando restrições mecânicas de balanceamento...",
      },
    });

    // 3. find_combo
    this.register({
      skill_id: "find_combo",
      purpose: "Discover valid attack sequences and cancel routes starting with given attacks",
      allowed_intents: ["COMBO_DISCOVERY"],
      required_context: ["starter_attack", "cancel_windows"],
      allowed_tools: ["combat_search", "combat_simulate"],
      input_schema: { starter_attack_id: "string", max_hits: "number" },
      output_schema: { combo_routes: "array", total_damage: "number" },
      validation_requirements: ["require_cancel_window_verification"],
      failure_behavior: "return_empty_routes",
      public_labels: {
        combat_search: "Buscando ataques com janelas de cancelamento...",
        combat_simulate: "Testando sequências e hits de combo...",
      },
    });

    // 4. optimize_combo
    this.register({
      skill_id: "optimize_combo",
      purpose: "Maximize combo damage, minimize execution cost and duration",
      allowed_intents: ["COMBO_OPTIMIZATION"],
      required_context: ["starter_attack", "resource_meter"],
      allowed_tools: ["combat_search", "combat_simulate", "combat_verify"],
      input_schema: { starter_attack_id: "string", meter_budget: "number" },
      output_schema: { optimal_route: "array", peak_damage: "number" },
      validation_requirements: ["require_strict_fuel_bound"],
      failure_behavior: "return_best_effort",
      public_labels: {
        combat_search: "Examinando rotas de dano máximo...",
        combat_simulate: "Otimizando sequências no simulador...",
        combat_verify: "Verificando limites de burst e juggle...",
      },
    });

    // 5. diagnose_stun_loop
    this.register({
      skill_id: "diagnose_stun_loop",
      purpose: "Identify infinite loops, infinite stun locks, and unescapable sequences",
      allowed_intents: ["BALANCE_ANALYSIS"],
      required_context: ["loop_attacks", "simulation_cycles"],
      allowed_tools: ["combat_simulate", "combat_verify", "combat_explain_gate"],
      input_schema: { cycle_attacks: "array" },
      output_schema: { is_infinite: "boolean", escape_window_frames: "number" },
      validation_requirements: ["require_cycle_analysis"],
      failure_behavior: "flag_unsafe",
      public_labels: {
        combat_simulate: "Simulando repetições de sequência...",
        combat_verify: "Validando integridade contra loops infinitos...",
        combat_explain_gate: "Examinando relatório de ciclos...",
      },
    });

    // 6. analyze_counterplay
    this.register({
      skill_id: "analyze_counterplay",
      purpose: "Analyze opponent response windows and defensive options",
      allowed_intents: ["COMBAT_ANALYSIS", "BALANCE_ANALYSIS"],
      required_context: ["attacker", "defender"],
      allowed_tools: ["combat_search", "combat_simulate", "combat_verify"],
      input_schema: { attack_id: "string" },
      output_schema: { reaction_window: "number", defensive_options: "array" },
      validation_requirements: ["require_reaction_window_check"],
      failure_behavior: "flag_inconclusive",
      public_labels: {
        combat_search: "Consultando recovery e blockstun...",
        combat_simulate: "Simulando janelas de resposta do oponente...",
        combat_verify: "Verificando conformidade de reação...",
      },
    });

    // 7. analyze_frame_advantage
    this.register({
      skill_id: "analyze_frame_advantage",
      purpose: "Calculate on-hit and on-block advantage in frames",
      allowed_intents: ["COMBAT_ANALYSIS"],
      required_context: ["attack_id"],
      allowed_tools: ["combat_search", "combat_simulate"],
      input_schema: { attack_id: "string" },
      output_schema: { on_hit: "number", on_block: "number" },
      validation_requirements: ["require_canonical_frame_data"],
      failure_behavior: "return_zero_advantage",
      public_labels: {
        combat_search: "Consultando tempos de ativação e recuperação...",
        combat_simulate: "Calculando vantagem em frames...",
      },
    });

    // 8. propose_balance_adjustment
    this.register({
      skill_id: "propose_balance_adjustment",
      purpose: "Create balance adjustment proposals validated through simulation and verification",
      allowed_intents: ["BALANCE_ANALYSIS"],
      required_context: ["active_attacks", "project_revision"],
      allowed_tools: [
        "combat_search",
        "combat_simulate",
        "combat_verify",
        "combat_propose_change",
        "combat_impact_analysis",
      ],
      input_schema: { attack_id: "string", mutations: "array" },
      output_schema: { proposal_id: "string", validation_verdict: "string" },
      validation_requirements: ["require_simulation_then_validation"],
      failure_behavior: "reject_proposal",
      public_labels: {
        combat_search: "Analisando valores atuais de combate...",
        combat_simulate: "Simulando impacto da proposta...",
        combat_verify: "Validando restrições mecânicas da proposta...",
        combat_propose_change: "Criando proposta de alteração...",
        combat_impact_analysis: "Avaliando impacto colateral...",
      },
    });

    // 9. validate_proposal
    this.register({
      skill_id: "validate_proposal",
      purpose: "Validate proposed changes against mechanical rules and project specs",
      allowed_intents: ["SPEC_VALIDATION"],
      required_context: ["proposed_changeset", "specs"],
      allowed_tools: ["combat_simulate", "combat_verify", "combat_explain_gate"],
      input_schema: { changeset_id: "string", profile: "string" },
      output_schema: { verdict: "string", violations: "array" },
      validation_requirements: ["require_authoritative_gate"],
      failure_behavior: "fail_closed",
      public_labels: {
        combat_simulate: "Executando simulação de conformidade...",
        combat_verify: "Validando contra regras mecânicas e specs...",
        combat_explain_gate: "Examinando evidências de conformidade...",
      },
    });

    // 10. explain_simulation
    this.register({
      skill_id: "explain_simulation",
      purpose: "Explain simulation metrics, timeline events, and mechanical validator verdicts",
      allowed_intents: ["EXPLANATION"],
      required_context: ["simulation_run_id"],
      allowed_tools: ["combat_explain_gate", "list_scenarios"],
      input_schema: { run_id: "string" },
      output_schema: { explanation: "string", metrics_summary: "object" },
      validation_requirements: ["require_gate_run_record"],
      failure_behavior: "return_generic_explanation",
      public_labels: {
        combat_explain_gate: "Examinando detalhes do veredito...",
        list_scenarios: "Consultando cenários de teste...",
      },
    });
  }

  private register(skill: SkillDefinition): void {
    this.skills.set(skill.skill_id, skill);
  }
}
