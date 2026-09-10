import type { TelemetryPort, TelemetrySpan } from "@combat-designer/backend";
import type { LogEvent, CorrelationContext } from "@combat-designer/backend";
import { NativeTracer } from "../tracing/tracer.js";
import { NativeMetricsRegistry } from "../metrics/instrumentation.js";
import { StructuredLogger } from "../logging/structured-logger.js";

export interface TelemetryAdapterConfig {
  tracer?: NativeTracer;
  metrics?: NativeMetricsRegistry;
  logger?: StructuredLogger;
}

/**
 * Production TelemetryAdapter implementing TelemetryPort.
 * Strictly adheres to Failure Isolation:
 * Telemetry failures MUST NEVER interrupt or alter domain execution.
 */
export class TelemetryAdapter implements TelemetryPort {
  public readonly tracer: NativeTracer;
  public readonly metrics: NativeMetricsRegistry;
  public readonly logger: StructuredLogger;

  constructor(config: TelemetryAdapterConfig = {}) {
    this.tracer = config.tracer ?? new NativeTracer();
    this.metrics = config.metrics ?? new NativeMetricsRegistry();
    this.logger = config.logger ?? new StructuredLogger({ silent: true });
  }

  public recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    try {
      this.metrics.record(name, value, labels);
    } catch {
      // Non-blocking fail-safe: failure in metric recording must never halt domain
    }
  }

  public emitLog(event: LogEvent): void {
    try {
      this.logger.log(event);
    } catch {
      // Non-blocking fail-safe: failure in logging must never halt domain
    }
  }

  public startSpan(name: string, correlation?: CorrelationContext): TelemetrySpan {
    try {
      return this.tracer.startSpan(name, correlation);
    } catch {
      // Non-blocking fail-safe: return no-op span on error
      return {
        setAttribute: () => {},
        recordError: () => {},
        end: () => {},
      };
    }
  }
}
