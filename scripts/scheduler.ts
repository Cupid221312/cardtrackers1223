// Keeps the market data updating: runs a refresh cycle immediately, then
// every 10 minutes until you stop it (Ctrl+C). Run alongside `npm run dev`:
//   npm run scheduler
import { runRefresh } from "../src/lib/refresh";

const TEN_MINUTES = 10 * 60 * 1000;

async function tick() {
  try {
    console.log(await runRefresh());
  } catch (e) {
    console.error("refresh failed:", e);
  }
}

console.log("Market scheduler started — refreshing every 10 minutes. Ctrl+C to stop.");
tick();
setInterval(tick, TEN_MINUTES);
