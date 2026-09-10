export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

export class AuthRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly attempts = new Map<string, number[]>();

  constructor(options: RateLimiterOptions = { maxAttempts: 5, windowMs: 60000 }) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
  }

  public isRateLimited(key: string): boolean {
    const now = Date.now();
    const timestamps = this.attempts.get(key) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    return recent.length >= this.maxAttempts;
  }

  public recordAttempt(key: string): void {
    const now = Date.now();
    const timestamps = this.attempts.get(key) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.attempts.set(key, recent);
  }

  public reset(key: string): void {
    this.attempts.delete(key);
  }

  public clear(): void {
    this.attempts.clear();
  }
}
