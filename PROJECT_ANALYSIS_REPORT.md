# TrapDetector AI — Technical Analysis and Handoff Report

**Review date:** 2026-10-09
**Purpose:** Source-based explanation of the application's architecture, live data path, deterministic market rules, and known limitations.

> This is a code inspection, not a penetration test, financial audit, or evidence that the strategy is profitable. No `.env` values or API credentials are included.

## 1. Executive summary

TrapDetector AI is a React/TypeScript dashboard that consumes public Binance ticker and the active three-timeframe kline series (1m, 5m, 15m), then evaluates deterministic technical-indicator consensus and fast-entry scalping rules alongside the original pattern engine. It does not use mock data, generate random values, compute synthetic trap/confidence scores, or place trades. If the app has not received 100 candles for each timeframe, it shows “Gathering 100-Candle MTF Data...”.

The repository also includes an Express proxy for a signed private Binance account request. The frontend dashboard currently does not call `/api/account`; account data is separate from the public market-data pipeline.

Despite the product name, the trap classifier is not a machine-learning or generative AI model. It cannot identify “retail” or “smart money” participants, prove intent, or guarantee outcomes. The stop-loss signal uses the requested Smart Money Accumulation headline as a pattern label, while the explanation cautions that buyer identity is not observed.

## 2. Technology and entry points

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, lucide-react, and `vite-plugin-pwa`.
- **Backend:** Node.js ES modules, Express, Axios, CORS, dotenv, and Node's built-in `crypto`.
- **Frontend entry:** [`src/main.tsx`](./src/main.tsx) mounts [`src/App.tsx`](./src/App.tsx).
- **Backend entry:** [`server.js`](./server.js).
- **Development commands:** `npm run dev` starts Vite on port 3000; `npm run start:server` starts Express on port 5000.
- **Backend API base:** [`src/services/backendApi.ts`](./src/services/backendApi.ts) uses `import.meta.env.VITE_BACKEND_URL` with `https://tredji.onrender.com` as fallback for custom backend routes. The Vite development proxy uses the same configured URL/fallback. This proxy is a development-server feature, not a production reverse-proxy deployment configuration.
- **Validation:** `npm run lint` runs `tsc --noEmit`; `npm test` runs deterministic rule tests; `npm run build` creates the production frontend bundle.

### Installable PWA

`public/manifest.json` defines the app identity, standalone display mode, and dark theme; its cyberpunk SVG app icons are in `public/icons/`. `vite-plugin-pwa` generates and registers a service worker with automatic updates and precaches the built app shell and static assets. It does not cache live Binance API/WebSocket responses or make market data available offline. The Settings modal captures the browser's `beforeinstallprompt` event and presents the install action when supported; installed/standalone sessions hide that action.

### Backend market worker

The Express process starts `backend/marketWorker.js` alongside the HTTP listener. It maintains a server-side watchlist (the five current defaults, or 1-5 Binance USDT symbols supplied through `TRACKED_SYMBOLS`), bootstraps 100 candles for each of `1m`, `5m`, and `15m` sequentially to avoid request bursts, and listens to Binance ticker and kline streams for those markets. It tries Binance's public market-data mirror first and serializes REST calls across the worker. HTTP 418/429 responses pause requests until Binance's retry/ban expiry, rather than retrying against every host or retrying too early. The worker calculates the same ten 1m/5m indicator votes, uses the 15m EMA-50 as the macro trend filter, and adds the fast-entry `SCALP_OPPORTUNITY` rules without disturbing the legacy signal engine. It retains the latest ticker, candles, analysis, and update/error state in memory; `GET /api/market-status` returns a no-cache snapshot. The 15m series is refreshed on its own cadence.

`App.tsx` polls the endpoint every five seconds and when the page is revisited. For symbols in the server watchlist it prefers the server-calculated analysis; the existing browser feed remains as a compatibility fallback and for the live ticker search. Backend state is process memory and is rebuilt after a Render restart; this is not durable storage. A continuously running Render instance is required for 24/7 collection—sleeping/free instances cannot keep a worker alive while suspended.

## 3. Frontend data pipeline

### Startup and tracked markets

The active UI and browser-side fallback market-data orchestration are in [`src/App.tsx`](./src/App.tsx). Five default markets are BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and XRPUSDT; a valid stored list in browser localStorage may override defaults. The selected list is limited to five markets. When available, the backend watchlist snapshot supplies the preferred analysis for its symbols.

### Historical candles and rate limits

On selected-market changes, `App.tsx` loads 100 public Binance klines per symbol for 1m, 5m, and 15m. Initial REST calls are sequential; records are merged by open time and stored in a bounded 120-candle array per timeframe. The 15m series is refreshed on its own interval. A Binance HTTP 418/429 response is surfaced without trying alternate REST hosts, avoiding retries that could amplify a rate limit. Other network/HTTP failures can fall back across Binance REST mirrors.

### WebSocket streams

The active combined Binance stream subscribes to `<symbol>@ticker`, `<symbol>@kline_1m`, and `<symbol>@kline_5m` for each selected coin, plus `!ticker@arr` for the live market-search list.

- Ticker messages update selected-coin last price and 24-hour statistics.
- Kline messages validate and upsert by candle open time, sort chronologically, and retain the newest 120 candle records per timeframe. The current open candle is replaced on each stream update; Binance's `k.x` flag marks its final closed update.
- Valid ticker or kline data marks the stream live and resets the retry counter. WebSocket errors, closes, and initialization failures schedule one guarded reconnect with exponential delays of 1, 2, 4, 8, then 10 seconds (capped at 10 seconds). Before retry, current socket event handlers are detached and the socket is closed; effect cleanup cancels the pending retry and closes the socket. While reconnecting, the connection blocker shows the retry status.
- The 1m and 5m indicator calculations use closed candles. The master candle patterns use the latest closed 1m candle, not its partial volume. Last price and 24-hour ticker values remain live between closes.

The duplicate, unused [`src/hooks/useBinanceTracker.ts`](./src/hooks/useBinanceTracker.ts) implementation was removed. `App.tsx` is the single active source of WebSocket state and updates.

## 4. MTF technical-indicator and trap rules

[`src/utils/trapEngine.ts`](./src/utils/trapEngine.ts) uses the `technicalindicators` package for all ten lower-timeframe indicators: RSI(14), MACD(12,26,9), EMA(20), EMA(50), SMA(50), Stochastic(14,3,3), CCI(20), ADX(14), Williams %R(14), and Bollinger Bands(20,2). It requires at least 100 candles in all three timeframe arrays and enough closed 1m/5m values to produce the indicators before returning analysis. An incomplete array yields `null`, and the main card displays “Gathering 100-Candle MTF Data...”.

For each indicator, the engine calculates an independent BUY/SELL/NEUTRAL vote on both 1m and 5m. Retail sentiment becomes **EXTREME BULLISH** only when each timeframe independently has at least 7 BUY votes; it becomes **EXTREME BEARISH** only when each has at least 7 SELL votes. Otherwise it is MIXED. This conservative cross-timeframe interpretation is shown as separate 1m and 5m vote counts in the UI.

Vote mapping is deterministic: RSI uses oversold (<30) and overbought (>70) with the 50 midpoint inside the range; MACD compares line with signal; EMA(20), EMA(50), and SMA(50) compare close to the average; Stochastic compares %K and %D; CCI uses its zero line; ADX requires ADX >=20 and compares +DI/-DI; Williams %R compares with -50; Bollinger Bands compare close with the middle band. These are implementation choices, not a calibrated measure of retail positioning.

The 15m macro trend compares the latest closed close with the 15m EMA-50. The combined macro is BULLISH while price stays above the EMA-50, BEARISH while price stays below it, and NEUTRAL when it sits on or around that level.

Rules are checked in this order; first match wins. Fake Breakout is explicitly evaluated before Retail FOMO so it cannot be masked when both candle patterns match:

1. **Stop-loss sweep / entry pattern (`STOP_LOSS_HUNT_ENTRY`)** — combined macro is bullish, both lower timeframes have extreme bearish consensus, and the 1m signal candle sweeps/reclaims the prior 15-candle low, has a lower wick over 50% of its range, and has volume over 1.5x the previous 20-candle average.
2. **Low-volume breakout (`FAKE_BREAKOUT`)** — combined macro is bearish, both lower timeframes have extreme bullish consensus, and the 1m signal high exceeds the previous 15-candle high on volume below the prior 20-candle average.
3. **Retail FOMO (`RETAIL_TRAP_BHEED`)** — both lower timeframes have extreme bullish consensus, with three consecutive green 1m candles and non-increasing volume across those candles. This warning applies only when the higher-priority Fake Breakout rule did not match.
4. **Neutral (`NEUTRAL_SCANNING`)** — none of the three explicit master conditions matched.

The thresholds and each indicator's standard directional interpretation are implementation choices. Public aggregate candles/tickers cannot prove retail behavior, a stop-loss hunt, an operator trap, or smart-money participation.

The engine emits real measured fields (volume ratio, wick ratio, prior range, current ticker price) and qualitative severity. It does not calculate trap scores, probabilities, or synthetic confidence values. A neutral result is produced only after enough valid closed data exists; before then, the main UI says “Gathering 100-Candle MTF Data...”.

Focused tests are in [`src/utils/trapEngine.test.ts`](./src/utils/trapEngine.test.ts) and cover MTF readiness, indicator output shape, EMA-50 macro agreement, and absence of numeric scores.

## 5. UI surfaces

- [`src/components/TopHeader.tsx`](./src/components/TopHeader.tsx) and [`CuteLogo.tsx`](./src/components/CuteLogo.tsx): branding, tracked-coin management, search, and connection status.
- [`src/components/MainTrapCard.tsx`](./src/components/MainTrapCard.tsx): active market selector, signal, live ticker price, measured volume/wick/range metrics, action advice, and rule explanations. No score is displayed.
- [`src/components/CoinsDrawer.tsx`](./src/components/CoinsDrawer.tsx): mobile bottom sheet and permanent desktop coin-card grid. Missing analysis is shown as “Gathering Data...”.
- [`src/components/BottomNavBar.tsx`](./src/components/BottomNavBar.tsx): mobile thumb navigation; hidden at large desktop sizes.
- [`src/components/SelectedCoinsModal.tsx`](./src/components/SelectedCoinsModal.tsx): view/remove selected markets and open search.
- [`src/components/SearchTickerModal.tsx`](./src/components/SearchTickerModal.tsx): search streamed ticker results and manage tracked markets.

The responsive layout uses a centered maximum-width dashboard, mobile bottom navigation/sheets, and a desktop coin grid.

## 6. Backend proxy and secret boundary

[`server.js`](./server.js) reads credentials through dotenv and exits at startup if either `BINANCE_API_KEY` or `BINANCE_API_SECRET` is blank. The local `.env` is gitignored; never copy actual values into source, docs, screenshots, or chat.

`GET /api/account` generates a millisecond timestamp, signs `timestamp=<value>` with HMAC-SHA256 using the server-side secret, calls Binance's signed `/api/v3/account` endpoint with the API key in `X-MBX-APIKEY`, and returns a generic client error when the upstream request fails. The frontend bundle does not receive the API secret. No existing frontend component calls this route; custom backend request URLs should be built with `backendApiUrl` from `src/services/backendApi.ts`. The public market-data service remains separate and continues to call Binance's public API hosts directly.

### Deployment security items to address

- Restrict `cors()` to actual frontend origin(s); current permissive CORS is unsuitable for an exposed production deployment.
- Add application authentication/authorization and rate limiting before exposing account JSON to untrusted callers.
- Use a read-only, IP-restricted Binance API key where possible; never enable withdrawals for this integration.
- Configure an Axios timeout, production HTTPS, safe operational logging, and a production reverse proxy/secret store.
- The backend requires Binance keys to start even though public market data does not; deployment may need to separate the account-proxy process from the public dashboard.

## 7. Scope and limitations

- No order placement, cancellation, execution loop, or automated trading.
- No connected `/api/account` UI, balance display, or account persistence.
- No RSI, other unspecified strategies, LLM inference, model training, historical backtesting, calibrated probability, or profitability evidence.
- Public aggregate candles/tickers do not identify specific traders, motives, retail participation, or institutional accumulation.
- A reconnect loop is implemented, but there is no explicit stale-feed watchdog or automatic REST fallback when a socket stays open without delivering messages.
- `npm run lint` is a TypeScript check, not ESLint. Rule tests do not replace end-to-end WebSocket tests or financial validation.

## 8. Suggested prompt for a second AI reviewer

> Review the repository using `PROJECT_ANALYSIS_REPORT.md` as an orientation document, but verify each claim against source. Focus on: (1) correctness and freshness of the Binance ticker/kline pipeline, (2) deterministic rule boundary cases and misleading financial claims, (3) security of the signed Binance account proxy and production deployment boundary, and (4) test coverage and WebSocket lifecycle. Report evidence, user impact, confidence, and minimal recommendations. Do not treat any pattern label as proof of trader identity or a probability, do not assume the account route is connected to the UI, and do not reveal or request `.env` values.
