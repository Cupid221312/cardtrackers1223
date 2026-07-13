/**
 * 24/7 refresh scheduler.
 *
 * Ticks every REFRESH_INTERVAL_MS (default 10 min). Hardened for long runs:
 *  - Overlap guard: if a tick is still running when the interval fires, the
 *    new tick is skipped (not queued), so a slow cycle never causes them to
 *    stack and drain memory/DB connections.
 *  - Jitter (±10s) so multiple workers behind a load balancer don't sync up.
 *  - Lifecycle: SIGINT/SIGTERM stop the interval and disconnect Prisma.
 *    unhandledRejection is logged but does not kill the worker.
 *  - Every tick logs start, end, duration, and status for observability.
 *
 * Run alongside the web server via `npm run dev:all`, or in a separate
 * container/process in production.
 */
import { runRefresh } from "../src/lib/refresh";
import { installLifecycle, onShutdown } from "../src/lib/worker/lifecycle";

const BASE_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS ?? 10 * 60 * 1000);
const JITTER_MS = 10_000;

installLifecycle("scheduler");

let running = false;
let stopping = false;
let cycleId = 0;

async function tick() {
  if (stopping) return;
  if (running) {
    console.warn(`[scheduler] skipping tick — previous cycle still running`);
    return;
  }
  running = true;
  const id = ++cycleId;
  const started = Date.now();
  console.log(`[scheduler] cycle #${id} start ${new Date(started).toISOString()}`);
  try {
    const summary = await runRefresh();
    console.log(`[scheduler] cycle #${id} ok in ${Date.now() - started}ms — ${summary}`);
  } catch (e) {
    console.error(`[scheduler] cycle #${id} failed in ${Date.now() - started}ms:`, e);
  } finally {
    running = false;
  }
}

function scheduleNext() {
  if (stopping) return;
  const jitter = Math.floor((Math.random() - 0.5) * 2 * JITTER_MS);
  const delay = Math.max(1_000, BASE_INTERVAL_MS + jitter);
  timer = setTimeout(async () => {
    await tick();
    scheduleNext();
  }, delay);
}

let timer: NodeJS.Timeout | null = null;

onShutdown(() => {
  stopping = true;
  if (timer) clearTimeout(timer);
});

console.log(
  `[scheduler] started — interval ${BASE_INTERVAL_MS}ms ±${JITTER_MS}ms, MOCK_MODE=${process.env.MOCK_MODE ?? "true"}`
);
// Run one cycle immediately, then a self-rescheduling chain (so a long cycle
// pushes the next start back rather than queuing overlaps).
void (async () => {
  await tick();
  scheduleNext();
})();
