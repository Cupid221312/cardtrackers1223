import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchText, HttpError } from "./http";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Fresh mock per test.
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchText", () => {
  it("returns the body on 2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("hello", { status: 200 })) as unknown as typeof fetch;
    await expect(fetchText("https://example.test/")).resolves.toBe("hello");
  });

  it("throws HttpError with status on non-2xx and drains body", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchText("https://example.test/")).rejects.toMatchObject({ status: 503 });
  });

  it("aborts on timeout", async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      return new Promise<Response>((_res, rej) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () =>
          rej(new DOMException("aborted", "AbortError"))
        );
      });
    }) as unknown as typeof fetch;
    await expect(fetchText("https://slow.test/", { timeoutMs: 20 })).rejects.toBeInstanceOf(HttpError);
  });

  it("aborts when the response exceeds maxBytes", async () => {
    const bigStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(512));
        controller.enqueue(new Uint8Array(512));
        controller.enqueue(new Uint8Array(512));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(bigStream, { status: 200 })) as unknown as typeof fetch;
    await expect(fetchText("https://huge.test/", { maxBytes: 1000 })).rejects.toMatchObject({
      message: expect.stringContaining("exceeded 1000 bytes"),
    });
  });
});
