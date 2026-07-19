# Phase 1 — Strategy Decomposition & Fundamental Analysis

Sources: YouTube channels **PATsTrading** (Mack), **TradingLab**, and **DaytradeWarrior** (Ross Cameron / Warrior Trading).
Method: reconstructed from the channels' published written materials, documentation, strategy PDFs, and third-party breakdowns/backtests. Confidence level is marked per item: **[C]** confirmed from the trader's own materials, **[I]** inferred from consistent third-party documentation of their method.

Target adaptation for all three: **1-minute chart, SPX500 (US500/ES) and NASDAQ (US100/NQ)**.

---

## 1. PATsTrading — Mack ("Price Action Trading System", PATs)

**Style:** Pure price action scalping of index futures (ES/NQ). No indicators — plain candles, hand-drawn trendlines, and market structure. 20+ years of experience distilled into a mechanical scalp framework.

### 1.1 Core "indicators" & settings
- **None in the conventional sense [C].** The chart is bare. Structure is read via:
  - **Micro and major trendlines** connecting swing pivots ("market geometry") [C]
  - **Prior swing highs/lows** as support/resistance [C]
  - **Trading ranges** (sideways congestion) explicitly boxed out and treated differently from trends [C]

### 1.2 Entry triggers
- **The Second Entry (H2 / L2) — the heart of the system [C]:**
  - *2nd Entry Long:* in an uptrend (or at strong support), price pulls back, makes a first attempt to resume up that fails, pulls back again forming a **higher low**, then breaks the high of the signal bar → BUY stop entry 1 tick above the signal bar high.
  - *2nd Entry Short:* mirror image — lower high after a failed first attempt, SELL stop 1 tick below the signal bar low.
  - Rationale: the first pullback entry traps early traders; the second entry confirms real commitment.
- **Signal bar quality filter [C]:** the signal bar should close strongly in the trade direction (bar strength matters; weak/doji signal bars are skipped).
- **Location rule [C]:** "It is almost always better to wait on a second entry off of a strong support/resistance area unless it is a proven trading range." Entries in the *middle* of a range ("barbed wire") are forbidden.
- **Trendline-break sequencing [C]:** after a major trendline break, don't reverse immediately — wait for the pullback/second entry in the new direction.

### 1.3 Exit rules & risk
- **Fixed scalp target [C]:** 1 point (4 ticks) on ES per scalp; "scalp and run" variant takes partial profit at the scalp target and trails a runner.
- **Stop placement [C]:** 1–2 ticks beyond the signal bar, **hard cap of 2 points (8 ticks)** from entry. If the signal-bar stop would exceed the cap, either skip the trade or (per the manual) widen the profit target by the extra risk taken.
- **Risk symmetry rule [C]:** when the structural stop is wider, the target is extended so reward ≥ risk.

### 1.4 Timeframe & market-context notes
- Mack trades short-interval ES charts (tick-based/small time-based) [I] — the logic ports directly to a 1m chart on SPX500/NQ: swings are just faster.
- Context filter: trend vs. trading range classification decides *which* trades are allowed — with-trend 2nd entries in trends, fade-the-edges 2nd entries in confirmed ranges [C].

**What we take into the bot:** second-entry pullback logic, signal-bar stop with max-risk cap, range filter (no entries mid-congestion), reward ≥ risk enforcement.

---

## 2. TradingLab

**Style:** Indicator-assisted Smart Money Concepts (SMC). Their recurring formula across videos: an **EMA trend cloud** for bias + **order blocks / fair value gaps** for entry location.

### 2.1 Core indicators & settings
- **EMA ribbon: 13 / 21 / 34 / 55 EMA [I]** (from a code-level breakdown of their published indicator) — trend is "up" when the ribbon is stacked bullishly, "down" when stacked bearishly.
- **200 EMA [C]** as the master trend filter: *no longs below it, no shorts above it* (their "+23R" strategy video pairs the 200 EMA with order blocks specifically to filter bad setups).
- **Order Blocks [C]:** the last opposing candle (last down-candle before a strong up-move, or last up-candle before a strong down-move) preceding an impulsive displacement; treated as an institutional footprint. The zone = that candle's range. Invalidated ("mitigated") once price closes through it.
- Secondary tools that appear across their videos [I]: fair value gaps (3-candle imbalance), break of structure (BOS) to confirm the impulse that creates the OB.

### 2.2 Entry triggers
- **Long:** price above 200 EMA + EMA ribbon bullish → an impulsive move up creates a bullish order block → wait for price to **retrace into the order block zone** → enter on bullish reaction (rejection candle / touch of the zone) [C/I].
- **Short:** mirror image below the 200 EMA.
- Optional confirmation: the retrace also fills a fair value gap or sweeps a minor low into the OB (liquidity grab) before reversing [I].

### 2.3 Exit rules & risk
- **SL just beyond the far edge of the order block** (a few ticks/pips past it) [C/I].
- **TP at a fixed reward multiple, minimum 1.5–2R** [C], or at the next opposing structure level.
- Third-party backtests of their published indicator show it is trend-regime dependent (decent CAGR, deep drawdown when chopping) — reinforcing that the 200 EMA / ribbon filter is load-bearing, not decorative.

### 2.4 1m index adaptation
- On 1m SPX500/NQ, order blocks form constantly; only OBs created by **genuine displacement** (large-bodied impulse, ideally a BOS) are tradeable, and higher-timeframe (5m/15m) EMA direction supplies the bias [I].

**What we take into the bot:** 200 EMA + EMA-ribbon regime filter, order-block retracement entry zone, SL beyond zone, fixed-R take profit.

---

## 3. DaytradeWarrior — Ross Cameron (Warrior Trading)

**Style:** 1-minute momentum day trading. Important caveat: his bread-and-butter market is **low-float small-cap stocks**, not indices — so we extract the *mechanics* that transfer to SPX500/NQ and discard the stock-selection layer (float, news catalyst, gappers scan).

### 3.1 Core indicators & settings
- **9 EMA and 20 EMA on the 1-minute chart [C]** — the momentum backbone. Price holding above the 9 EMA = strong trend; 9>20 stacked = tradeable momentum.
- **MACD (standard 12/26/9) [C]** — used as a *regime switch*, not an entry signal: MACD line well above signal = full momentum, keep trading; **MACD cross below signal = stop taking longs** [C].
- **VWAP [C]** — intraday institutional line; longs favored above VWAP.

### 3.2 Entry triggers — the Micro Pullback [C]
1. A strong impulsive move up (momentum leg).
2. A *shallow* pullback — one to three 1m candles, small-bodied, holding well above the 9 EMA / pullback low staying tight.
3. **Entry: the first 1m candle that breaks its own high** (i.e., break of the prior candle's high ends the pullback).
4. Extra confirmation: setup resolving through a whole/round number adds conviction.
- **Gap & Go [C]** (open-specific): enter on the first pullback/consolidation break near pre-market/opening highs in the first minutes of the session.

### 3.3 Exit rules & risk
- **SL just under the pullback low** (a couple of ticks below) [C] — tight, structural.
- Sell into strength: scale out on extension; exit fully or stop trading when the **MACD crosses down** or price loses the 9 EMA on a closing basis [C].
- **Risk definition [C]:** risk = entry − stop, position sized off that distance (not off notional). Daily discipline: hard rules about when to walk away for the day.

### 3.4 1m index adaptation
- Indices lack the catalyst/float dynamics, so the transferable core is: **momentum-leg → micro pullback → break of prior 1m high**, gated by 9>20 EMA, price>VWAP, and MACD-positive regime; symmetric shorts (9<20, <VWAP, MACD negative) work on indices where shorting is frictionless [I].

**What we take into the bot:** 9/20 EMA + VWAP + MACD regime gates, micro-pullback break-of-prior-candle trigger, stop under pullback low, "stop trading" circuit-breaker mentality.

---

## 4. Synthesis map — how the three merge into one 1m strategy

| Layer | Source | Implementation |
|---|---|---|
| Master bias | TradingLab | 200 EMA + 13/21/34/55 ribbon on 1m, confirmed by 5m/15m EMA direction (HTF filter) |
| Momentum regime | Ross Cameron | 9>20 EMA, price vs VWAP, MACD line vs signal as on/off switch |
| Entry location | TradingLab + Mack | Pullback into order-block / EMA zone at meaningful structure — never mid-range |
| Entry trigger | Mack + Ross | Second-entry logic: pullback ends, buy the break of the signal candle's high (sell the break of its low) |
| Stop | Mack + Ross | 1–2 ticks beyond signal-bar/pullback swing, capped by an ATR-based max (Mack's 2-point rule generalized) |
| Target | Mack + TradingLab | Fixed R-multiple (default 1.5–2R) with optional partial + trailing runner ("scalp and run") |
| Circuit breaker | Ross + spec | MACD-cross shutdown + daily max-loss % equity halt |
| Sizing | Ross + spec | Fixed % of equity risked per trade, size = risk$ / stop distance |

### Open decisions before Phase 2 (defaults chosen, overridable)
1. **Session filter:** default to US cash session (09:30–16:00 ET), skipping the first minute and last 10 minutes. 1m index signals overnight are mostly spread-noise.
2. **Both directions enabled** (longs and shorts) — indices short cleanly.
3. **Order-block detection** implemented as: last opposing candle before a move of ≥ X·ATR that breaks structure; zone drawn, entry on first retest only.

---

## 5. Risk statement

1-minute index scalping is an extreme-risk activity: transaction costs consume a large fraction of each trade's range, historical 1m backtests overstate results (fill assumptions, slippage), and regime shifts silently break indicator-based systems. Everything built from this analysis is for education and paper trading first. Nothing here is financial advice.
