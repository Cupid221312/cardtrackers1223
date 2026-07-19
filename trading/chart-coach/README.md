# Chart Coach v0 — TradingView signal companion

Zero-dependency Node.js app: receives the Confluence Scalper's webhook alerts and shows
explained signal cards in a dark side panel with desktop notifications and sound.

## Run it

```bash
node server.js
```

Then open **http://localhost:3717** in your browser. Click **🔔 Enable alerts** once to
allow desktop notifications, and **Test** to see a sample card. To make it a floating
side panel, use your browser's "open in app/popup window" (Chrome: ⋮ → Cast/Save →
*Create shortcut → open as window*) and size it ~400px wide next to your charts.

Signals are also appended to `data/signals.jsonl` (your journal raw data).

## Connect TradingView (requires a paid TV plan for webhooks)

TradingView can only POST to public HTTPS URLs, so expose the local port with a free
Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:3717
```

It prints a URL like `https://random-words.trycloudflare.com`. In TradingView:

1. Add the Confluence Scalper strategy to your 1m chart.
2. Create an Alert → Condition: the strategy → **"Order fills events"**.
3. Message: `{{strategy.order.alert_message}}`
4. Enable **Webhook URL** and paste: `https://random-words.trycloudflare.com/webhook`

Every fill now pops a card explaining why the bot acted.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /webhook` | TradingView alert receiver (JSON or plain text) |
| `GET /` | The panel UI |
| `GET /events` | SSE stream (last 50 replayed, then live) |
| `GET /history` | JSON of the in-memory event buffer |

## Roadmap (from the Phase 3 blueprint)

- **v1:** live 1m data feed + Signal Context Builder → dynamic, per-trade explanations
- **v2:** candle-pattern & micro-structure detectors with a live reading feed
- **v3:** lesson engine with replay drills, journal analytics, weekly digest
