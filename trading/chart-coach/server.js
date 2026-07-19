// Chart Coach v0 — TradingView webhook listener + live signal panel
// Zero dependencies: runs on plain Node.js (v16+).  Usage:  node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3717;
const DATA_DIR = path.join(__dirname, "data");
const LOG_FILE = path.join(DATA_DIR, "signals.jsonl");
fs.mkdirSync(DATA_DIR, { recursive: true });

const events = []; // in-memory ring buffer (last 200)
const sseClients = new Set();

// v0 "static" trade reflector: explanations derived from the strategy's rule set.
// v1 will recompute indicators from a live feed and generate these dynamically.
const EXPLANATIONS = {
  "BUY ENTRY":
    "The bot went LONG: every regime gate agreed (9>20 EMA, ribbon stacked bullish, price above the 200 EMA and VWAP, MACD positive, 5-minute bias long), price made a 2–4 bar micro pullback into the 9/20 EMA zone — Mack's second entry — and then broke the signal bar's HIGH, proving the pullback was over. Stop sits ticks below the pullback swing; target is the configured R-multiple.",
  "SELL ENTRY":
    "The bot went SHORT: all gates flipped bearish (9<20 EMA, ribbon stacked bearish, price below the 200 EMA and VWAP, MACD negative, 5-minute bias short), a shallow 2–4 bar pullback rose into the EMA zone, and price broke the signal bar's LOW. Stop sits ticks above the pullback swing; target is the configured R-multiple.",
  "EXIT LONG":
    "The long closed — either the take-profit R-multiple was hit, the stop (or breakeven stop after +1R) was tagged, the MACD crossed down (Warrior's 'stop trading' signal), the session ended, or the daily circuit breaker tripped. Check the label on the TradingView chart for which one.",
  "EXIT SHORT":
    "The short closed — take-profit hit, stop/breakeven tagged, MACD crossed up against the position, session end, or circuit breaker. Check the chart label for which gate fired.",
};

function record(payload, raw) {
  const ev = {
    ts: new Date().toISOString(),
    event: payload.event || "UNKNOWN",
    symbol: payload.symbol || "?",
    explanation:
      EXPLANATIONS[payload.event] ||
      "Unrecognized event — raw alert text is shown below. If this came from TradingView, make sure the alert uses the strategy's JSON alert_message.",
    raw,
  };
  events.push(ev);
  if (events.length > 200) events.shift();
  fs.appendFile(LOG_FILE, JSON.stringify(ev) + "\n", () => {});
  const msg = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of sseClients) res.write(msg);
  console.log(`[${ev.ts}] ${ev.event} ${ev.symbol}`);
  return ev;
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/webhook") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { event: body.trim().slice(0, 120) };
      }
      record(payload, body.slice(0, 500));
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    return;
  }

  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    for (const ev of events.slice(-50)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.url === "/history") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(events));
    return;
  }

  if (req.url === "/" || req.url === "/index.html") {
    fs.readFile(path.join(__dirname, "public", "index.html"), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("missing public/index.html");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`Chart Coach v0 listening on http://localhost:${PORT}`);
  console.log(`Webhook endpoint:            http://localhost:${PORT}/webhook`);
  console.log(`Open the panel:              http://localhost:${PORT}/`);
});
