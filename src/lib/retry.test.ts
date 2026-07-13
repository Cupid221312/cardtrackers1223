import { describe, it, expect, vi } from "vitest";
import { isRetryable, withRetry } from "./retry";
import { HttpError } from "./http";

const noSleep = async () => {};

describe("isRetryable", () => {
  it("network errors (no status) are retryable", () => {
    expect(isRetryable(new HttpError("boom"))).toBe(true);
  });
  it("5xx is retryable", () => {
    expect(isRetryable(new HttpError("x", 503))).toBe(true);
  });
  it("429 and 408 are retryable", () => {
    expect(isRetryable(new HttpError("x", 429))).toBe(true);
    expect(isRetryable(new HttpError("x", 408))).toBe(true);
  });
  it("other 4xx are permanent", () => {
    expect(isRetryable(new HttpError("x", 404))).toBe(false);
    expect(isRetryable(new HttpError("x", 403))).toBe(false);
    expect(isRetryable(new HttpError("x", 401))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn(async () => 42);
    expect(await withRetry(fn, { sleep: noSleep })).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures up to the attempt cap", async () => {
    const fn = vi.fn(async () => {
      throw new HttpError("upstream down", 503);
    });
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops immediately on a permanent error", async () => {
    const fn = vi.fn(async () => {
      throw new HttpError("forbidden", 403);
    });
    await expect(withRetry(fn, { attempts: 5, sleep: noSleep })).rejects.toMatchObject({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds after a transient failure", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 2) throw new HttpError("temporary", 503);
      return "ok";
    });
    expect(await withRetry(fn, { attempts: 3, sleep: noSleep })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
