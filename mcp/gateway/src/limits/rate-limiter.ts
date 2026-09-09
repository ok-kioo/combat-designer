import { McpError } from "@combat-designer/shared-contracts";

export interface RateLimiterOptions {
  maxRequestSizeBytes?: number;
  maxCallsPerWindow?: number;
  windowMs?: number;
  maxRecursionDepth?: number;
}

export class GatewayExecutionLimiter {
  private maxRequestSizeBytes: number;
  private maxCallsPerWindow: number;
  private windowMs: number;
  private maxRecursionDepth: number;
  private callCounts = new Map<string, { count: number; windowStart: number }>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequestSizeBytes = options.maxRequestSizeBytes ?? 1024 * 1024; // 1MB
    this.maxCallsPerWindow = options.maxCallsPerWindow ?? 100;
    this.windowMs = options.windowMs ?? 60000;
    this.maxRecursionDepth = options.maxRecursionDepth ?? 5;
  }

  checkRequestSize(payload: unknown): void {
    const jsonString = JSON.stringify(payload ?? {});
    const size = Buffer.byteLength(jsonString, "utf8");
    if (size > this.maxRequestSizeBytes) {
      throw new McpError(
        "INVALID_REQUEST",
        `Request size ${size} bytes exceeds maximum allowed ${this.maxRequestSizeBytes} bytes.`
      );
    }
  }

  checkRateLimit(principalId: string): void {
    const now = Date.now();
    const tracker = this.callCounts.get(principalId) ?? { count: 0, windowStart: now };

    if (now - tracker.windowStart > this.windowMs) {
      tracker.count = 1;
      tracker.windowStart = now;
    } else {
      tracker.count += 1;
      if (tracker.count > this.maxCallsPerWindow) {
        throw new McpError(
          "RATE_LIMITED",
          `Rate limit of ${this.maxCallsPerWindow} requests per minute exceeded for principal '${principalId}'.`
        );
      }
    }

    this.callCounts.set(principalId, tracker);
  }

  checkRecursionDepth(depth = 0): void {
    if (depth > this.maxRecursionDepth) {
      throw new McpError(
        "POLICY_DENIED",
        `Call recursion depth ${depth} exceeds maximum allowed depth of ${this.maxRecursionDepth}.`
      );
    }
  }

  checkBudgetBounds(params: Record<string, unknown>): void {
    // Check config.budget
    const config = params?.config as Record<string, unknown> | undefined;
    const budget = config?.budget as Record<string, unknown> | undefined;
    if (budget) {
      if (typeof budget.max_frames === "number" && budget.max_frames > 3600) {
        throw new McpError("BUDGET_EXCEEDED", `Simulation max_frames (${budget.max_frames}) exceeds administrative limit of 3600.`);
      }
      if (typeof budget.max_events === "number" && budget.max_events > 5000) {
        throw new McpError("BUDGET_EXCEEDED", `Simulation max_events (${budget.max_events}) exceeds administrative limit of 5000.`);
      }
    }

    // Check verification_budget
    const vBudget = params?.verification_budget as Record<string, unknown> | undefined;
    if (vBudget) {
      if (typeof vBudget.max_events === "number" && vBudget.max_events > 10000) {
        throw new McpError("BUDGET_EXCEEDED", `Verification max_events exceeds administrative limit of 10000.`);
      }
      if (typeof vBudget.max_cycles === "number" && vBudget.max_cycles > 1000) {
        throw new McpError("BUDGET_EXCEEDED", `Verification max_cycles exceeds administrative limit of 1000.`);
      }
    }
  }
}
