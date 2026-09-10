import type { HealthStatus } from "../entity/index.js";

export interface ComponentHealthInfo {
  status: HealthStatus;
  latency_ms?: number;
  last_checked_at: string;
}

export interface HealthCheckPort {
  checkLiveness(): Promise<boolean>;
  checkReadiness(): Promise<boolean>;
  checkDependencies(): Promise<Record<string, ComponentHealthInfo>>;
}
