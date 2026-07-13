/**
 * Process lifecycle for long-running background workers.
 *
 * Registers signal handlers so the container gets a clean shutdown (SIGTERM
 * from Docker/Render/Railway, SIGINT from Ctrl+C): user-supplied cleanup
 * functions run first, then Prisma disconnects, then we exit.
 *
 * Also catches unhandledRejection and uncaughtException:
 *  - unhandledRejection is LOGGED but does NOT exit. A single bad promise
 *    (e.g. one eBay fetch that rejected while nobody was awaiting) must not
 *    take down a 24/7 worker — the next cycle will simply try again.
 *  - uncaughtException is truly unrecoverable state: log, cleanup, exit 1
 *    so the platform's restart policy takes over.
 */
import { prisma } from "../db";

type Cleanup = () => void | Promise<void>;

const cleanups: Cleanup[] = [];
let shuttingDown = false;

export function onShutdown(fn: Cleanup) {
  cleanups.push(fn);
}

async function shutdown(reason: string, code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[lifecycle] shutting down: ${reason}`);

  // Run cleanups with a hard cap so a stuck handler can't block forever.
  const deadline = Date.now() + 10_000;
  for (const fn of cleanups) {
    if (Date.now() >= deadline) {
      console.warn("[lifecycle] cleanup deadline reached, forcing exit");
      break;
    }
    try {
      await Promise.race([
        Promise.resolve(fn()),
        new Promise((_, rej) => setTimeout(() => rej(new Error("cleanup timeout")), Math.max(1, deadline - Date.now()))),
      ]);
    } catch (e) {
      console.error("[lifecycle] cleanup failed:", e);
    }
  }

  try {
    await prisma.$disconnect();
  } catch (e) {
    console.error("[lifecycle] prisma disconnect failed:", e);
  }
  // Flush stdout/stderr before exiting — process.exit() otherwise drops any
  // buffered log lines (including this shutdown message), which would leave
  // ops staring at a hard kill with no explanation.
  await Promise.all([
    new Promise<void>((r) => process.stdout.write("", () => r())),
    new Promise<void>((r) => process.stderr.write("", () => r())),
  ]);
  process.exit(code);
}

export function installLifecycle(label: string) {
  process.on("SIGINT", () => void shutdown(`SIGINT (${label})`, 0));
  process.on("SIGTERM", () => void shutdown(`SIGTERM (${label})`, 0));

  process.on("unhandledRejection", (reason) => {
    console.error(`[lifecycle] unhandledRejection in ${label}:`, reason);
    // Deliberately do not exit — worker should survive one bad promise.
  });

  process.on("uncaughtException", (err) => {
    console.error(`[lifecycle] uncaughtException in ${label}:`, err);
    void shutdown("uncaughtException", 1);
  });
}
