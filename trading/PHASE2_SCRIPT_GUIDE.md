# Phase 2 — Confluence Scalper 1m: Setup & Usage Guide

Script: `confluence_scalper_1m.pine` (Pine Script v5, `strategy()` type — Strategy Tester tracks net profit, drawdown, and win rate natively).

## Installation

1. TradingView → open a chart for **US500/SPX500** or **US100/NAS100** (CFD tickers, e.g. `CAPITALCOM:US100`, `PEPPERSTONE:US500`) or the futures (`ES1!`, `NQ1!`).
2. Set the chart timeframe to **1 minute**.
3. Pine Editor (bottom panel) → paste the entire script → **Add to chart**.
4. Open the **Strategy Tester** tab for performance stats.
5. In *Properties*, set commission/spread to match your broker — this matters enormously on 1m. A realistic spread for US100 CFDs is 1–2 points; without it the backtest is fiction.

## How a trade happens (the logic pipeline)

1. **Regime gates** (all must agree, each individually toggleable):
   - 9 EMA > 20 EMA (Warrior momentum backbone)
   - 13/21/34/55 EMA ribbon stacked (TradingLab trend cloud)
   - Price on the right side of the **200 EMA** and **session VWAP**
   - **MACD** line on the right side of its signal line
   - **5m higher-timeframe** 9/20 EMA agreeing (non-repainting — uses last *closed* 5m bar)
2. **Pullback**: 2–4 bars of counter-trend closes (2 minimum ≈ Mack's second entry; 4 maximum keeps it a *micro* pullback) that reach the 9 EMA or the 20 EMA zone — never a mid-air entry. Optional stricter mode: pullback must also tap a detected **order block**.
3. **Trigger**: a stop order 1 tick beyond the signal bar (buy above its high / sell below its low) — you enter only when price *proves* the pullback is over, exactly the PATs/Warrior mechanic. Order cancels if the regime dies first.
4. **Risk check before the order exists**: stop distance computed (Swing / ATR / Percent mode); if it exceeds the **max-risk ATR cap** (Mack's 2-point rule generalized), the trade is skipped entirely.
5. **Sizing**: contracts = (equity × risk%) / stop distance — fixed-fractional 1% default.
6. **Exits**: bracket SL + TP at an R-multiple (default 1.5R); optional breakeven move at +1R; optional MACD-flip early exit; forced flat at session end; **daily circuit breaker** closes everything and halts new trades after the equity loss threshold (default 3%).

## Signals on the chart

- Green **BUY ENTRY** / red **SELL ENTRY** labels at fills
- Blue **EXIT LONG** / maroon **EXIT SHORT** labels at closes
- Live SL (red) and TP (green) lines while in a trade
- Red background = circuit breaker tripped for the day

## Webhook alerts (feeds the Phase 3 companion app)

Create an alert on the strategy with "Order fills events"; each order carries a JSON `alert_message` (`{"event":"BUY ENTRY","symbol":"US100"}` etc.) that TradingView will POST to any webhook URL.

## Tuning notes per instrument

| Setting | US500 (SPX) | US100 (NASDAQ) |
|---|---|---|
| Max risk cap (×ATR) | 2.0 | 2.0–2.5 (NQ runs hotter) |
| TP (R multiple) | 1.5 | 1.5–2.0 |
| Zone tolerance (×ATR) | 0.25 | 0.3 |
| Daily circuit breaker | 3% | 3% |

## Known limitations (read before trusting a backtest)

- **Intrabar fills are estimates.** TradingView assumes your stop entry fills at the stop price; live you'll pay slippage in fast tape. The `slippage=1` default helps but is optimistic during news.
- **1m history is limited** on Basic/free plans (~a few months). Test across different volatility regimes before drawing conclusions.
- **Same-bar SL+TP ambiguity**: when one bar spans both the stop and the target, the tester guesses order. Enable "Use bar magnifier" (Premium) for accuracy.
- The HTF filter uses the last **closed** 5m bar, so it never repaints — but it also means bias lags up to 5 minutes by design.
- No overnight or pre-market trades: the session window (default 09:31–15:50 ET) and forced flatten are deliberate.
