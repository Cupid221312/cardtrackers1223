/**
 * Exponential backoff for transient network failures.
 *
 * "Transient" is important: retrying a 404 or a 403 (permission) is not just
 * wasteful, it's how you get IP-banned. A `HttpError` with a 4xx status is
 * *never* retried; a 5xx or a raw network error (timeout, socket reset,
 * aborted body) *is*. Delay is `base * 2^attempt` with ±25% jitter so
 * multiple workers don't hammer an upstream in lockstep.
 */
import { HttpError } from "./http";

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  /** Override for testing so we're not sleeping seconds in unit tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Called with (err, attemptIndex, delayMs) before each retry sleep. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    // Network/parse failure (no status) — retry.
    if (err.status == null) return true;
    // 408 Request Timeout and 429 Too Many Requests are worth another try
    // after a delay; other 4xx are permanent.
    if (err.status === 408 || err.status === 429) return true;
    if (err.status >= 500) return true;
    return false;
  }
  // Any other thrown Error is treated as transient by default — better than
  // giving up on a genuinely-recoverable low-level error.
  return true;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 8_000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const willRetry = i < attempts - 1 && isRetryable(e);
      if (!willRetry) throw e;
      const backoff = Math.min(max, base * 2 ** i);
      const jitter = backoff * (Math.random() * 0.5 - 0.25);
      const delay = Math.max(0, Math.round(backoff + jitter));
      opts.onRetry?.(e, i, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
