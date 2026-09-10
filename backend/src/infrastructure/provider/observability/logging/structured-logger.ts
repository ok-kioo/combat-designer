import type { LogEvent, LogLevel } from "@combat-designer/backend";
import { redactSensitiveData } from "@combat-designer/backend";

export interface LoggerOptions {
  silent?: boolean;
  retainLogs?: boolean;
}

export class StructuredLogger {
  private readonly logs: LogEvent[] = [];
  private readonly silent: boolean;
  private readonly retainLogs: boolean;

  constructor(options: LoggerOptions = {}) {
    this.silent = options.silent ?? false;
    this.retainLogs = options.retainLogs ?? true;
  }

  /**
   * Emits a structured log event with recursive redaction of sensitive credentials.
   * Fail-safe: will NEVER throw or disrupt domain operations.
   */
  public log(event: Partial<LogEvent> & { event_name: string }): void {
    try {
      const sanitizedDetails = event.details
        ? (redactSensitiveData(event.details) as Record<string, unknown>)
        : undefined;

      const fullEvent: LogEvent = {
        timestamp: event.timestamp ?? new Date().toISOString(),
        level: event.level ?? "info",
        event_name: event.event_name,
        workspace_id: event.workspace_id,
        principal_id: event.principal_id,
        correlation_id: event.correlation_id,
        request_id: event.request_id,
        tool_id: event.tool_id,
        operation: event.operation,
        status: event.status,
        duration_ms: event.duration_ms,
        error_code: event.error_code,
        details: sanitizedDetails,
      };

      if (this.retainLogs) {
        this.logs.push(fullEvent);
      }

      if (!this.silent) {
        const line = JSON.stringify(fullEvent);
        if (fullEvent.level === "error") {
          process.stderr.write(line + "\n");
        } else {
          process.stdout.write(line + "\n");
        }
      }
    } catch {
      // Fail-safe: logging error must never break business logic
    }
  }

  public debug(event_name: string, details?: Record<string, unknown>): void {
    this.log({ level: "debug", event_name, details });
  }

  public info(event_name: string, details?: Record<string, unknown>): void {
    this.log({ level: "info", event_name, details });
  }

  public warn(event_name: string, details?: Record<string, unknown>): void {
    this.log({ level: "warn", event_name, details });
  }

  public error(event_name: string, error_code?: string, details?: Record<string, unknown>): void {
    this.log({ level: "error", event_name, error_code, details });
  }

  public getRetainedLogs(): ReadonlyArray<LogEvent> {
    return this.logs;
  }

  public clearRetainedLogs(): void {
    this.logs.length = 0;
  }
}
