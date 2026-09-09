import crypto from "node:crypto";
import type { CanonicalAttack } from "@combat-designer/shared-contracts";

export class IngestionCache {
  private cache = new Map<string, CanonicalAttack>();

  private computeKey(sourceHash: string, parserVersion: string): string {
    return crypto
      .createHash("sha256")
      .update(`${sourceHash}:${parserVersion}`)
      .digest("hex");
  }

  get(sourceHash: string, parserVersion: string): CanonicalAttack | undefined {
    const key = this.computeKey(sourceHash, parserVersion);
    return this.cache.get(key);
  }

  set(sourceHash: string, parserVersion: string, attack: CanonicalAttack): void {
    const key = this.computeKey(sourceHash, parserVersion);
    this.cache.set(key, attack);
  }

  has(sourceHash: string, parserVersion: string): boolean {
    const key = this.computeKey(sourceHash, parserVersion);
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
