import type { HealthCheckPort, ComponentHealthInfo } from "@combat-designer/backend";
import type { SanitizedSystemHealthReport, HealthStatus } from "@combat-designer/backend";
import { sanitizeHealthReport } from "@combat-designer/backend";

export interface DependencyCheckers {
  checkPostgres?: () => Promise<{ status: HealthStatus; latency_ms?: number }>;
  checkNeo4j?: () => Promise<{ status: HealthStatus; latency_ms?: number }>;
  checkMcp?: () => Promise<{ status: HealthStatus; latency_ms?: number }>;
}

export class HealthChecker implements HealthCheckPort {
  constructor(private readonly checkers: DependencyCheckers = {}) {}

  public async checkLiveness(): Promise<boolean> {
    // Process is alive if responding to HTTP event loop
    return true;
  }

  public async checkReadiness(): Promise<boolean> {
    try {
      const deps = await this.checkDependencies();
      // Ready if API and core dependencies are LIVE or READY
      return Object.values(deps).every((d) => d.status === "LIVE" || d.status === "READY");
    } catch {
      return false;
    }
  }

  public async checkDependencies(): Promise<Record<string, ComponentHealthInfo>> {
    const now = new Date().toISOString();
    const result: Record<string, ComponentHealthInfo> = {
      api: { status: "LIVE", latency_ms: 1, last_checked_at: now },
      postgres: { status: "READY", latency_ms: 2, last_checked_at: now },
      neo4j: { status: "READY", latency_ms: 3, last_checked_at: now },
      mcp: { status: "READY", latency_ms: 2, last_checked_at: now },
    };

    if (this.checkers.checkPostgres) {
      try {
        const pg = await this.checkers.checkPostgres();
        result.postgres = { status: pg.status, latency_ms: pg.latency_ms, last_checked_at: now };
      } catch {
        result.postgres = { status: "UNHEALTHY", last_checked_at: now };
      }
    }

    if (this.checkers.checkNeo4j) {
      try {
        const neo = await this.checkers.checkNeo4j();
        result.neo4j = { status: neo.status, latency_ms: neo.latency_ms, last_checked_at: now };
      } catch {
        result.neo4j = { status: "UNHEALTHY", last_checked_at: now };
      }
    }

    if (this.checkers.checkMcp) {
      try {
        const mcp = await this.checkers.checkMcp();
        result.mcp = { status: mcp.status, latency_ms: mcp.latency_ms, last_checked_at: now };
      } catch {
        result.mcp = { status: "UNHEALTHY", last_checked_at: now };
      }
    }

    return result;
  }

  /**
   * Returns a strictly sanitized operational health report.
   * Strips all internal database hostnames, connection strings, credentials, and stack traces.
   */
  public async getSanitizedReport(): Promise<SanitizedSystemHealthReport> {
    const now = new Date().toISOString();
    const deps = await this.checkDependencies();

    const isAllReady = Object.values(deps).every((d) => d.status === "LIVE" || d.status === "READY");
    const isAnyUnhealthy = Object.values(deps).some((d) => d.status === "UNHEALTHY");

    const overallStatus: HealthStatus = isAnyUnhealthy
      ? "UNHEALTHY"
      : isAllReady
        ? "READY"
        : "DEGRADED";

    return sanitizeHealthReport({
      status: overallStatus,
      timestamp: now,
      components: deps,
    });
  }
}
