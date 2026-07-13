/**
 * Per-source circuit breaker.
 *
 * closed  — normal operation.
 * open    — failed too many times recently; new calls are short-circuited
 *           (they throw immediately without hitting the upstream) so we stop
 *           wasting an entire cycle on a source that's down.
 * half-open — after a cooldown, one call is allowed through as a probe:
 *           success closes the breaker, failure opens it again.
 *
 * The refresh loop wraps each connector call with `breaker.exec(...)`, so a
 * source that's down never poisons cycles for other sources.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Consecutive failures needed to open. */
  failureThreshold?: number;
  /** How long to stay open before allowing a probe. */
  cooldownMs?: number;
  /** Test hook — return current time in ms. */
  now?: () => number;
}

export class CircuitOpenError extends Error {
  constructor(name: string, readonly openedAt: number) {
    super(`circuit '${name}' is open`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(readonly name: string, opts: BreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 4;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  get status(): CircuitState {
    // Auto-promote to half-open once the cooldown has elapsed so `exec` can
    // pick it up without a separate scheduler tick.
    if (this.state === "open" && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half-open";
    }
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.status;
    if (s === "open") throw new CircuitOpenError(this.name, this.openedAt);
    try {
      const out = await fn();
      this.recordSuccess();
      return out;
    } catch (e) {
      this.recordFailure();
      throw e;
    }
  }

  private recordSuccess() {
    this.failures = 0;
    this.state = "closed";
  }

  private recordFailure() {
    if (this.state === "half-open") {
      // Probe failed — go straight back to open with a fresh cooldown.
      this.state = "open";
      this.openedAt = this.now();
      return;
    }
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}
