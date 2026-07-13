import { describe, it, expect } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker";

const failing = async () => {
  throw new Error("boom");
};
const succeeding = async () => 1;

describe("CircuitBreaker", () => {
  it("stays closed on isolated failures", async () => {
    const b = new CircuitBreaker("t", { failureThreshold: 3 });
    await expect(b.exec(failing)).rejects.toThrow("boom");
    await expect(b.exec(succeeding)).resolves.toBe(1);
    expect(b.status).toBe("closed");
  });

  it("opens after N consecutive failures", async () => {
    const b = new CircuitBreaker("t", { failureThreshold: 3, cooldownMs: 60_000 });
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(failing)).rejects.toThrow();
    }
    expect(b.status).toBe("open");
    // Next call short-circuits without executing fn.
    await expect(b.exec(succeeding)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("transitions to half-open after cooldown then closes on success", async () => {
    let clock = 1_000;
    const b = new CircuitBreaker("t", { failureThreshold: 2, cooldownMs: 500, now: () => clock });
    await expect(b.exec(failing)).rejects.toThrow();
    await expect(b.exec(failing)).rejects.toThrow();
    expect(b.status).toBe("open");

    clock += 501;
    expect(b.status).toBe("half-open");
    await expect(b.exec(succeeding)).resolves.toBe(1);
    expect(b.status).toBe("closed");
  });

  it("re-opens if the half-open probe fails", async () => {
    let clock = 1_000;
    const b = new CircuitBreaker("t", { failureThreshold: 2, cooldownMs: 500, now: () => clock });
    await expect(b.exec(failing)).rejects.toThrow();
    await expect(b.exec(failing)).rejects.toThrow();

    clock += 600;
    expect(b.status).toBe("half-open");
    await expect(b.exec(failing)).rejects.toThrow("boom");
    expect(b.status).toBe("open");
    await expect(b.exec(succeeding)).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
