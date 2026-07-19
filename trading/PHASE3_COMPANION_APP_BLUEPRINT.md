# Phase 3 — "Chart Coach" Companion App Blueprint

A lightweight always-on-top pop-up window that runs beside TradingView: live market reader, micro-lesson engine, and trade reflector for the Confluence Scalper strategy.

---

## 1. Recommended tech stack

**Electron + TypeScript + React** for the app shell, with a small **Node.js webhook listener** embedded in the main process.

Why Electron over the alternatives:

| Option | Verdict |
|---|---|
| **Electron (chosen)** | Native always-on-top frameless window, system tray, notifications, full charting libs (lightweight-charts is free from TradingView itself), one codebase, easy local webhook server in-process. |
| Python/Tkinter | Fastest to prototype, but ugly for candlestick rendering and weak for real-time streaming UI. Fine for a v0 proof of concept. |
| Web overlay (browser tab) | Can't float above other apps; browsers can't receive webhooks without a tunnel. Rejected as the primary UI, kept as a remote-view option. |

Support layer:
- **Charting:** [`lightweight-charts`](https://github.com/tradingview/lightweight-charts) (TradingView's own OSS lib) for the mini-chart.
- **Data feed:** Twelve Data / Polygon.io / Databento websocket for live 1m US500/US100 candles (free tiers cover 1m delayed; paid for real-time). Fallback: yfinance-style REST polling every candle close for the budget version.
- **Local storage:** SQLite (via better-sqlite3) for lesson progress, signal history, and journaling.
- **Tunnel for TradingView webhooks:** TradingView can only POST to public HTTPS URLs → run `cloudflared tunnel` (free) pointing at the local listener, or use ntfy.sh as a relay.

## 2. Architecture

```
┌────────────────────────────────────────────────────────────┐
│ TradingView (browser)                                      │
│   Confluence Scalper strategy → Alert (Order fills events) │
└───────────────┬────────────────────────────────────────────┘
                │ HTTPS POST  {"event":"BUY ENTRY","symbol":"US100"}
                ▼
   Cloudflare tunnel → localhost:3717
┌───────────────┴────────────────────────────────────────────┐
│ Electron MAIN process                                      │
│  • Express webhook listener (:3717)                        │
│  • Market-data websocket client (1m candles)               │
│  • Signal Context Builder (joins webhook + live data)      │
│  • SQLite (lessons, journal, signal history)               │
└───────────────┬────────────────────────────────────────────┘
                │ IPC
┌───────────────┴────────────────────────────────────────────┐
│ Electron RENDERER — frameless always-on-top window (380px) │
│  Tabs: [ Live Read ] [ Lessons ] [ Reflector ] [ Journal ] │
└────────────────────────────────────────────────────────────┘
```

The **Signal Context Builder** is the key component: when a webhook arrives, it snapshots the last ~60 one-minute candles from the data feed, recomputes the same indicators the Pine script uses (EMAs, VWAP, MACD, ATR — trivial to mirror in TS), detects which gates were true, and produces the natural-language explanation. The webhook only says *what* happened; the context builder reconstructs *why*.

## 3. Core feature — Live Market Reading

Runs continuously on each closed 1m candle:

**Candle pattern detector** (rule-based, no ML needed):
- Engulfing: body engulfs prior body, close beyond prior extreme
- Hammer / shooting star: wick ≥ 2× body, body in top/bottom third
- Doji at structure: body < 15% of range while touching an EMA/level

**Micro-structure engine:**
- Rolling swing pivots (fractal 2-2) → tracks HH/HL vs LH/LL state
- **Break of structure (BOS):** close beyond the last confirmed pivot
- **Liquidity sweep:** wick pierces a prior swing/session extreme or the prior 5m low/high, then closes back inside — flagged in amber, because it's simultaneously a trap warning *and* the TradingLab entry precondition
- **False breakout vs momentum classifier:** breakout candle graded on (a) close location in its range, (b) body vs ATR, (c) follow-through of the next candle. Grade A/B/C displayed — this is the app's core teaching loop.

Each detection paints a marker on the mini-chart and pushes a one-line feed entry: *"14:32 — Sweep of 5m low + hammer at 20 EMA. Watch for second entry."*

## 4. Micro-Lesson Engine (curriculum)

Progressive modules, each = 5-min concept card + live-chart spotting drill + quiz. The drill mode uses **replay**: the app replays a stored historical 1m day candle-by-candle and asks the user to click when they see the pattern; score vs the detector.

1. **Reading one candle** — bodies, wicks, close location = who won the minute
2. **The 1m trend skeleton** — swings, HH/HL, when structure actually breaks
3. **Traps** — false breakouts vs momentum (grade A/B/C system), why first entries fail
4. **The second entry** (Mack) — spotting failed first attempts, higher lows
5. **Micro pullbacks** (Warrior) — shallow vs deep, the 9 EMA test, break-of-prior-high trigger
6. **Zones** (TradingLab) — order blocks, FVGs, why location beats signal
7. **Regime** — VWAP/MACD/ribbon: when NOT to trade (chop recognition)
8. **Risk arithmetic** — R-multiples, why the circuit breaker exists, expectancy math

Unlock gating: pass the spotting drill at ≥70% before the next module opens.

## 5. Trade Reflector

On every webhook event the app pops to front with a card:

> **🟢 BUY ENTRY — US100 @ 21,435.2 (14:32 ET)**
> The bot entered because the pullback made **2 lower closes into the 20 EMA zone** while **9>20 EMA, price above VWAP, MACD positive, and the 5m bias was long** — and price then **broke the signal bar's high**, one minute after **sweeping the prior 5-minute low**.
> Stop 21,428.4 (swing − 2 ticks) · Target 21,445.4 (1.5R) · Size = 1% equity risk
> *Lesson link: Module 4 — Second Entries*

Exit cards show result in R, which gate (TP / SL / MACD flip / session end) closed it, and append the trade to the Journal with a screenshot of the mini-chart. A weekly digest summarizes win rate by setup grade — connecting the lesson engine to real outcomes.

## 6. UI/UX blueprint

- **Window:** 380×720, frameless, always-on-top toggle (📌), 90% opacity when unfocused, snaps to screen edge; system-tray minimize.
- **Top bar:** symbol + live regime chip — 🟢 LONG REGIME / 🔴 SHORT REGIME / ⚪ NO-TRADE (chop) / ⛔ HALTED (circuit breaker) — mirroring the Pine gates so the user always knows what the bot is *allowed* to do before it does it.
- **Tab 1 Live Read:** mini candlestick chart (last 60 min) with pattern/structure markers + scrolling event feed.
- **Tab 2 Lessons:** module list with progress rings; drill mode takes over the chart area.
- **Tab 3 Reflector:** card stack of today's signals, newest on top.
- **Tab 4 Journal:** table of trades (time, side, R result, setup grade), equity-curve sparkline, daily loss meter that fills toward the circuit-breaker line.
- **Notifications:** OS toast on every entry/exit even when minimized; optional sound.
- Dark theme default, green/red only for direction, amber reserved for warnings (sweeps, chop, approaching daily loss limit).

## 7. Build order (practical roadmap)

1. **v0 (weekend):** webhook listener + toast notifications + static explanation from the JSON payload. No chart, no feed. Immediately useful.
2. **v1:** market-data websocket + mini-chart + Signal Context Builder (real "why" explanations).
3. **v2:** pattern/structure detectors + live feed.
4. **v3:** lesson engine with replay drills; journal + weekly digest.

## 8. Honest constraints

- TradingView webhooks require a paid TradingView plan (Essential+) and fire only on alert triggers — the app cannot *place* trades, only narrate them (that's a feature: keep execution and education separated).
- Free data feeds are 15-min delayed for indices; real-time US500/US100 websockets cost ~$10–30/mo. The replay-based lessons work fully offline on free historical data.
- Webhook→popup latency is typically 1–3 s: fine for reflection, never fast enough for manual copy-trading — don't try.
