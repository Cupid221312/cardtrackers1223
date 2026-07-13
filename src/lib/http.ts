/**
 * Hardened fetch for long-running workers.
 *
 * A plain `fetch()` in a 24/7 worker will eventually meet a socket that never
 * closes — a hung TLS handshake, a stalled body stream, an upstream that
 * accepted the connection and forgot about it — and the worker pins forever.
 * This wrapper enforces a hard timeout via AbortController and caps the
 * response body so an oversized page can't exhaust memory.
 */

export interface FetchOptions extends RequestInit {
  /** Milliseconds before the request is aborted. Default 15_000. */
  timeoutMs?: number;
  /** Maximum response body size in bytes. Default 5 MB. */
  maxBytes?: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export async function fetchText(url: string | URL, opts: FetchOptions = {}): Promise<string> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, signal: userSignal, ...init } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  const onUserAbort = () => controller.abort((userSignal as AbortSignal).reason);
  if (userSignal) {
    if (userSignal.aborted) controller.abort(userSignal.reason);
    else userSignal.addEventListener("abort", onUserAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new HttpError(`fetch failed for ${url}`, undefined, e);
  } finally {
    clearTimeout(timer);
    if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
  }

  if (!res.ok) {
    // Drain the body so the socket returns to the pool; ignore drain errors.
    try {
      await res.arrayBuffer();
    } catch {
      /* noop */
    }
    throw new HttpError(`${res.status} ${res.statusText} for ${url}`, res.status);
  }

  // Streamed size cap: aborts mid-read if the body would blow our budget.
  const reader = res.body?.getReader();
  if (!reader) return res.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  const decoder = new TextDecoder("utf-8");
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort(new Error(`response exceeded ${maxBytes} bytes`));
        throw new HttpError(`response exceeded ${maxBytes} bytes for ${url}`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();
}
