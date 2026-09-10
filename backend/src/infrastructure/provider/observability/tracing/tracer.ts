import {
  context,
  SpanStatusCode,
  type Span as OtelSpan,
  type Tracer as OtelTracer,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { TelemetrySpan, TelemetrySpanStatus, TraceContext, CorrelationContext } from "@combat-designer/backend";
import { parseTraceparent, formatTraceparent } from "@combat-designer/backend";

export interface NativeTracerConfig {
  serviceName?: string;
  serviceVersion?: string;
  /**
   * OTLP collector endpoint for exporting traces to OpenTelemetry Collector / Tempo.
   * Defaults to OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or http://localhost:4318/v1/traces
   */
  otlpEndpoint?: string;
  /**
   * Set to true EXCLUSIVELY in tests to enable synchronous in-memory inspection.
   * Production runtime MUST leave this false/undefined so canonical BatchSpanProcessor + OTLP is used.
   */
  enableInMemoryExporter?: boolean;
  /**
   * Configuration options for BatchSpanProcessor to bound memory and configure out-of-band export.
   */
  batchOptions?: {
    maxQueueSize?: number;
    scheduledDelayMillis?: number;
    exportTimeoutMillis?: number;
    maxExportBatchSize?: number;
  };
}

export class NativeTracer {
  private readonly provider: BasicTracerProvider;
  private readonly tracer: OtelTracer;
  private readonly propagator: W3CTraceContextPropagator;
  public readonly inMemoryExporter?: InMemorySpanExporter;
  public readonly processor: SpanProcessor;

  constructor(config: NativeTracerConfig = {}) {
    const resource = resourceFromAttributes({
      "service.name": config.serviceName ?? "combat-designer-engine",
      "service.version": config.serviceVersion ?? "0.1.0",
    });

    if (config.enableInMemoryExporter) {
      this.inMemoryExporter = new InMemorySpanExporter();
      this.processor = new SimpleSpanProcessor(this.inMemoryExporter);
    } else {
      const otlpUrl =
        config.otlpEndpoint ??
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        "http://localhost:4318/v1/traces";

      const exporter = new OTLPTraceExporter({ url: otlpUrl });
      this.processor = new BatchSpanProcessor(exporter, {
        maxQueueSize: config.batchOptions?.maxQueueSize ?? 2048,
        scheduledDelayMillis: config.batchOptions?.scheduledDelayMillis ?? 5000,
        exportTimeoutMillis: config.batchOptions?.exportTimeoutMillis ?? 30000,
        maxExportBatchSize: config.batchOptions?.maxExportBatchSize ?? 512,
      });
    }

    this.provider = new BasicTracerProvider({
      resource,
      spanProcessors: [this.processor],
    });

    this.tracer = this.provider.getTracer("combat-designer-tracer", "0.1.0");
    this.propagator = new W3CTraceContextPropagator();
  }

  public async shutdown(): Promise<void> {
    try {
      await this.provider.shutdown();
    } catch {
      // Non-blocking fail-safe
    }
  }

  public async forceFlush(): Promise<void> {
    try {
      await this.provider.forceFlush();
    } catch {
      // Non-blocking fail-safe
    }
  }

  /**
   * Starts an OpenTelemetry span wrapped in a fail-safe TelemetrySpan.
   */
  public startSpan(name: string, correlation?: CorrelationContext): TelemetrySpan {
    try {
      const activeContext = context.active();
      const otelSpan = this.tracer.startSpan(name, undefined, activeContext);

      // Add correlation context as span attributes (if present)
      if (correlation) {
        if (correlation.correlation_id) otelSpan.setAttribute("correlation.id", correlation.correlation_id);
        if (correlation.workspace_id) otelSpan.setAttribute("workspace.id", correlation.workspace_id);
        if (correlation.principal_id) otelSpan.setAttribute("principal.id", correlation.principal_id);
        if (correlation.principal_type) otelSpan.setAttribute("principal.type", correlation.principal_type);
        if (correlation.tool_id) otelSpan.setAttribute("tool.id", correlation.tool_id);
        if (correlation.use_case) otelSpan.setAttribute("use_case", correlation.use_case);
        if (correlation.simulation_id) otelSpan.setAttribute("simulation.id", correlation.simulation_id);
        if (correlation.gate_run_id) otelSpan.setAttribute("gate_run.id", correlation.gate_run_id);
        if (correlation.changeset_id) otelSpan.setAttribute("changeset.id", correlation.changeset_id);
      }

      return new OtelSpanWrapper(otelSpan);
    } catch {
      // Non-blocking fail-safe: return no-op span if tracer fails
      return {
        setAttribute: () => {},
        recordError: () => {},
        end: () => {},
      };
    }
  }

  /**
   * Extracts W3C Trace Context from HTTP headers using native W3CTraceContextPropagator.
   */
  public extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | null {
    try {
      const traceparentHeader = typeof headers["traceparent"] === "string"
        ? headers["traceparent"]
        : Array.isArray(headers["traceparent"])
          ? headers["traceparent"][0]
          : undefined;

      return parseTraceparent(traceparentHeader);
    } catch {
      return null;
    }
  }

  /**
   * Injects W3C Trace Context into headers carrier.
   */
  public injectTraceContext(traceCtx: TraceContext, carrier: Record<string, string>): void {
    try {
      carrier["traceparent"] = formatTraceparent(traceCtx);
      if (traceCtx.tracestate) {
        carrier["tracestate"] = traceCtx.tracestate;
      }
    } catch {
      // Fail-safe non-blocking
    }
  }

  public getTracer(): OtelTracer {
    return this.tracer;
  }
}

class OtelSpanWrapper implements TelemetrySpan {
  private ended = false;

  constructor(private readonly span: OtelSpan) {}

  public setAttribute(key: string, value: string | number | boolean): void {
    if (this.ended) return;
    try {
      this.span.setAttribute(key, value);
    } catch {
      // Non-blocking
    }
  }

  public recordError(error: unknown): void {
    if (this.ended) return;
    try {
      const err = error instanceof Error ? error : new Error(String(error));
      this.span.recordException(err);
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    } catch {
      // Non-blocking
    }
  }

  public end(status?: TelemetrySpanStatus): void {
    if (this.ended) return;
    this.ended = true;
    try {
      if (status === "OK") {
        this.span.setStatus({ code: SpanStatusCode.OK });
      } else if (status === "ERROR") {
        this.span.setStatus({ code: SpanStatusCode.ERROR });
      } else if (status === "UNSET") {
        this.span.setStatus({ code: SpanStatusCode.UNSET });
      }
      this.span.end();
    } catch {
      // Non-blocking
    }
  }
}
