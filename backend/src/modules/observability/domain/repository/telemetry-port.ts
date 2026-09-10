import type { LogEvent, CorrelationContext, TelemetrySpan, TelemetrySpanStatus } from "../entity/index.js";

export type { TelemetrySpan, TelemetrySpanStatus };

/**
 * Fail-safe TelemetryPort interface.
 * Observability MUST NEVER possess domain authority.
 * Any telemetry failure must be swallowed gracefully without interrupting domain calculation.
 */
export interface TelemetryPort {
  recordMetric(name: string, value: number, labels?: Record<string, string>): void;
  emitLog(event: LogEvent): void;
  startSpan(name: string, correlation?: CorrelationContext): TelemetrySpan;
}

/**
 * No-op telemetry implementation for tests or when telemetry is disabled.
 */
export class NoopTelemetryPort implements TelemetryPort {
  recordMetric(_name: string, _value: number, _labels?: Record<string, string>): void {}
  emitLog(_event: LogEvent): void {}
  startSpan(_name: string, _correlation?: CorrelationContext): TelemetrySpan {
    return {
      setAttribute: () => {},
      recordError: () => {},
      end: () => {},
    };
  }
}
