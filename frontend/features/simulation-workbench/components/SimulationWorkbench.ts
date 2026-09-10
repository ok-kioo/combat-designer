import { ApiClient, defaultApiClient } from "../../../shared/services/api-client.js";
import type { SimulationScenarioConfig, WorkbenchState } from "../types/index.js";

export interface SimulationWorkbenchProps {
  workspaceId: string;
  apiClient?: ApiClient;
  initialScenario?: Partial<SimulationScenarioConfig>;
}

export class SimulationWorkbenchController {
  public readonly workspaceId: string;
  private readonly apiClient: ApiClient;
  private state: WorkbenchState;

  constructor(props: SimulationWorkbenchProps) {
    this.workspaceId = props.workspaceId;
    this.apiClient = props.apiClient ?? defaultApiClient;
    this.state = {
      workspaceId: props.workspaceId,
      scenario: {
        scenario_id: props.initialScenario?.scenario_id ?? "sc_default_duel",
        actors: props.initialScenario?.actors ?? [
          { actor_id: "hero", team: 1, initial_health: 100, attack_ids: ["atk_light_punch"] },
          { actor_id: "dummy", team: 2, initial_health: 100, attack_ids: [] },
        ],
        budget: {
          max_frames: props.initialScenario?.budget?.max_frames ?? 120,
          max_iterations: props.initialScenario?.budget?.max_iterations ?? 5000,
        },
        tick_rate: props.initialScenario?.tick_rate ?? 60,
      },
      isRunning: false,
    };
  }

  public getState(): WorkbenchState {
    return { ...this.state };
  }

  public async runSimulation(scenarioUpdate?: Partial<SimulationScenarioConfig>): Promise<any> {
    this.state.isRunning = true;
    this.state.error = undefined;
    if (scenarioUpdate) {
      this.state.scenario = { ...this.state.scenario, ...scenarioUpdate };
    }

    try {
      const result = await this.apiClient.simulate(this.workspaceId, {
        workspace_id: this.workspaceId,
        scenario: this.state.scenario,
        config: { budget: this.state.scenario.budget, tick_rate: this.state.scenario.tick_rate },
      });

      this.state.simulationResult = result.simulation;
      this.state.isRunning = false;
      return result.simulation;
    } catch (err: any) {
      this.state.isRunning = false;
      this.state.error = err?.message || "Simulation execution failed";
      throw err;
    }
  }

  public async runVerification(options: { shouldFail?: boolean; budgetExceeded?: boolean } = {}): Promise<any> {
    if (!this.state.simulationResult) {
      await this.runSimulation();
    }

    this.state.isRunning = true;
    this.state.error = undefined;

    try {
      const result = await this.apiClient.verify(
        this.workspaceId,
        {
          workspace_id: this.workspaceId,
          scenario_id: this.state.scenario.scenario_id,
          should_fail: options.shouldFail,
          budget_exceeded: options.budgetExceeded,
        },
        this.state.simulationResult
      );

      this.state.gateResult = {
        gate_run_id: result.gate_result.gate_run_id,
        verdict: result.gate_result.verdict,
        violations: result.gate_result.violations ?? [],
        checks_count: result.gate_result.summary?.total_checks ?? result.gate_result.checks?.length ?? 0,
        explanation: result.gate_result.explanation,
      };
      this.state.isRunning = false;
      return this.state.gateResult;
    } catch (err: any) {
      this.state.isRunning = false;
      this.state.error = err?.message || "Verification failed";
      throw err;
    }
  }

  public renderModel() {
    return {
      column: "left" as const,
      view: "workbench" as const,
      workspaceId: this.workspaceId,
      scenarioId: this.state.scenario.scenario_id,
      actorsCount: this.state.scenario.actors.length,
      budget: { ...this.state.scenario.budget },
      hasSimulation: Boolean(this.state.simulationResult),
      simulation: this.state.simulationResult
        ? {
            simulationId: this.state.simulationResult.simulation_id,
            totalFrames: this.state.simulationResult.total_frames,
            finalHash: this.state.simulationResult.final_state_hash,
            eventsCount: this.state.simulationResult.events.length,
            events: this.state.simulationResult.events,
            status: this.state.simulationResult.status,
          }
        : null,
      hasGateResult: Boolean(this.state.gateResult),
      gateResult: this.state.gateResult
        ? {
            gateRunId: this.state.gateResult.gate_run_id,
            verdict: this.state.gateResult.verdict,
            violationsCount: this.state.gateResult.violations.length,
            violations: this.state.gateResult.violations,
            checksCount: this.state.gateResult.checks_count,
          }
        : null,
      isRunning: this.state.isRunning,
      error: this.state.error,
    };
  }

  public renderHtml(): string {
    const model = this.renderModel();
    const verdictBadgeClass = model.gateResult
      ? `badge-verdict badge-${model.gateResult.verdict.toLowerCase()}`
      : "";

    const eventsRows = model.simulation?.events
      .map(
        (e) => `
        <li class="timeline-event">
          <span class="frame-tag">Frame ${e.frame}</span>
          <span class="event-type">${e.type}</span>
          ${e.actor_id ? `<span class="actor-tag">[${e.actor_id}]</span>` : ""}
        </li>`
      )
      .join("\n") ?? "<li class='empty-state'>No simulation run yet.</li>";

    return `
      <section class="simulation-workbench" data-workspace="${model.workspaceId}">
        <header class="workbench-header">
          <h2>Simulation & Gate Workbench</h2>
          <div class="workbench-actions">
            <button class="btn btn-primary" id="btn-run-sim">Run Simulation</button>
            <button class="btn btn-secondary" id="btn-run-gate">Verify Gate</button>
          </div>
        </header>

        <div class="workbench-grid">
          <div class="workbench-card">
            <h3>Scenario Configuration</h3>
            <p><strong>Scenario:</strong> ${model.scenarioId}</p>
            <p><strong>Actors:</strong> ${model.actorsCount}</p>
            <p><strong>Max Frames:</strong> ${model.budget.max_frames}</p>
          </div>

          <div class="workbench-card">
            <h3>Mechanical Gate Verdict</h3>
            ${
              model.gateResult
                ? `<div class="${verdictBadgeClass}"><strong>${model.gateResult.verdict}</strong></div>
                   <p>Run ID: ${model.gateResult.gateRunId}</p>
                   <p>Violations: ${model.gateResult.violationsCount}</p>`
                : `<p class="muted">No gate verification run yet.</p>`
            }
          </div>
        </div>

        <div class="timeline-section">
          <h3>Simulation Timeline (${model.simulation?.totalFrames ?? 0} frames)</h3>
          <ul class="timeline-list">
            ${eventsRows}
          </ul>
        </div>
      </section>
    `;
  }
}
