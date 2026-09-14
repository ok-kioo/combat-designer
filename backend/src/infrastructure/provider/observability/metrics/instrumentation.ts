import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { PrometheusExporter, PrometheusSerializer } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { Counter, Histogram, UpDownCounter, Meter } from "@opentelemetry/api";
import {
  API_METRICS,
  GATEWAY_METRICS,
  SIMULATION_METRICS,
  PROPOSAL_METRICS,
  sanitizeMetricLabels,
} from "./metric-definitions.js";

export class NativeMetricsRegistry {
  private readonly meterProvider: MeterProvider;
  public readonly prometheusExporter: PrometheusExporter;
  private readonly serializer: PrometheusSerializer;
  private readonly meter: Meter;

  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private upDownCounters = new Map<string, UpDownCounter>();

  constructor(serviceName = "combat-designer-service") {
    const resource = resourceFromAttributes({
      "service.name": serviceName,
      "service.version": "0.1.0",
    });

    this.prometheusExporter = new PrometheusExporter({
      preventServerStart: true,
    });
    this.serializer = new PrometheusSerializer();

    this.meterProvider = new MeterProvider({
      resource,
      readers: [this.prometheusExporter],
    });

    this.meter = this.meterProvider.getMeter("combat-designer-metrics", "0.1.0");
    this.initInstruments();
  }

  private initInstruments(): void {
    // API
    this.counters.set(API_METRICS.REQUEST_COUNT, this.meter.createCounter(API_METRICS.REQUEST_COUNT, { description: "Total API requests" }));
    this.counters.set(API_METRICS.REQUEST_ERROR_COUNT, this.meter.createCounter(API_METRICS.REQUEST_ERROR_COUNT, { description: "Total API errors" }));
    this.histograms.set(API_METRICS.REQUEST_LATENCY_MS, this.meter.createHistogram(API_METRICS.REQUEST_LATENCY_MS, { description: "API request latency in ms", unit: "ms" }));

    // Gateway
    this.counters.set(GATEWAY_METRICS.AUTH_ALLOW_COUNT, this.meter.createCounter(GATEWAY_METRICS.AUTH_ALLOW_COUNT, { description: "Gateway authorization allows" }));
    this.counters.set(GATEWAY_METRICS.AUTH_DENY_COUNT, this.meter.createCounter(GATEWAY_METRICS.AUTH_DENY_COUNT, { description: "Gateway authorization denials" }));
    this.counters.set(GATEWAY_METRICS.WORKSPACE_MISMATCH_COUNT, this.meter.createCounter(GATEWAY_METRICS.WORKSPACE_MISMATCH_COUNT, { description: "Gateway workspace mismatches" }));
    this.counters.set(GATEWAY_METRICS.POLICY_DENIED_COUNT, this.meter.createCounter(GATEWAY_METRICS.POLICY_DENIED_COUNT, { description: "Gateway policy denials" }));
    this.counters.set(GATEWAY_METRICS.RATE_LIMITED_COUNT, this.meter.createCounter(GATEWAY_METRICS.RATE_LIMITED_COUNT, { description: "Gateway rate limit events" }));

    // Simulation
    this.counters.set(SIMULATION_METRICS.COUNT, this.meter.createCounter(SIMULATION_METRICS.COUNT, { description: "Simulation executions" }));
    this.counters.set(SIMULATION_METRICS.FAILURE_COUNT, this.meter.createCounter(SIMULATION_METRICS.FAILURE_COUNT, { description: "Simulation failures" }));
    this.counters.set(SIMULATION_METRICS.BUDGET_EXCEEDED_COUNT, this.meter.createCounter(SIMULATION_METRICS.BUDGET_EXCEEDED_COUNT, { description: "Simulation budget exhaustions" }));
    this.histograms.set(SIMULATION_METRICS.DURATION_MS, this.meter.createHistogram(SIMULATION_METRICS.DURATION_MS, { description: "Simulation duration in ms", unit: "ms" }));
    this.upDownCounters.set(SIMULATION_METRICS.FRAMES_TOTAL, this.meter.createUpDownCounter(SIMULATION_METRICS.FRAMES_TOTAL, { description: "Simulation frames computed" }));
    this.upDownCounters.set(SIMULATION_METRICS.EVENTS_TOTAL, this.meter.createUpDownCounter(SIMULATION_METRICS.EVENTS_TOTAL, { description: "Simulation events emitted" }));

    // Proposals
    this.counters.set(PROPOSAL_METRICS.CREATED_COUNT, this.meter.createCounter(PROPOSAL_METRICS.CREATED_COUNT, { description: "Consultative proposals created" }));
    this.counters.set(PROPOSAL_METRICS.WITHDRAWN_COUNT, this.meter.createCounter(PROPOSAL_METRICS.WITHDRAWN_COUNT, { description: "Proposals withdrawn" }));
    this.counters.set(PROPOSAL_METRICS.ARCHIVED_COUNT, this.meter.createCounter(PROPOSAL_METRICS.ARCHIVED_COUNT, { description: "Proposals archived" }));
  }

  /**
   * Records a metric value with fail-safe cardinality protection.
   * If labels contain forbidden high-cardinality keys, they are safely dropped.
   * Non-blocking: will NEVER throw or disrupt domain operations.
   */
  public record(name: string, value: number, labels?: Record<string, string>): void {
    try {
      const cleanLabels = sanitizeMetricLabels(labels);

      if (this.counters.has(name)) {
        this.counters.get(name)!.add(value, cleanLabels);
        return;
      }

      if (this.histograms.has(name)) {
        this.histograms.get(name)!.record(value, cleanLabels);
        return;
      }

      if (this.upDownCounters.has(name)) {
        this.upDownCounters.get(name)!.add(value, cleanLabels);
        return;
      }

      // If instrument does not exist yet, dynamically register as counter
      const counter = this.meter.createCounter(name);
      this.counters.set(name, counter);
      counter.add(value, cleanLabels);
    } catch {
      // Non-blocking fail-safe: telemetry failure must never fail domain
    }
  }

  /**
   * Formats collected OpenTelemetry metrics into Prometheus exposition text format
   * using the canonical @opentelemetry/exporter-prometheus serializer.
   */
  public async getPrometheusText(): Promise<string> {
    try {
      const collection = await this.prometheusExporter.collect();
      if (!collection || !collection.resourceMetrics) {
        return "# No metrics collected\n";
      }
      return this.serializer.serialize(collection.resourceMetrics);
    } catch {
      return "# Failed to collect metrics\n";
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.meterProvider.shutdown();
    } catch {
      // Non-blocking fail-safe
    }
  }
}
