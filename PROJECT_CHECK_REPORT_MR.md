# TrapDetector AI — तपशीलवार Project Check Report

**उद्देश:** दुसऱ्या AI किंवा developer कडून या repository ची स्वतंत्र तपासणी करून घेण्यासाठी architecture, features, data flow, नियम, Web Push, setup, चाचण्या आणि ज्ञात मर्यादा एकाच ठिकाणी सांगणे.

**महत्त्वाची सूचना:** हा source-code आधारित आढावा आहे. हा penetration test, financial audit, live production push test किंवा trading strategy च्या profitability चा पुरावा नाही. `.env` मधील secret values या report मध्ये नाहीत.

## 1. थोडक्यात प्रोजेक्ट काय आहे?

TrapDetector AI हा React + TypeScript dashboard आणि Node.js + Express backend असलेला installable Progressive Web App (PWA) आहे. तो Binance कडून public market tickers आणि candles घेतो, ठरावीक technical indicators आणि नियमांवरून market pattern दाखवतो आणि निवडलेल्या severity वर browser notification देऊ शकतो.

- हे **rule-based market analysis** आहे; सध्या signal बनवण्यासाठी AI/LLM model किंवा machine learning classifier वापरलेला नाही.
- “Retail trap”, “smart money” आणि “stop-loss hunt” ही rule-match साठीची labels आहेत. Public candle/ticker data वरून कोणता trader काय करतो हे सिद्ध होत नाही.
- App स्वतःहून कोणताही trade place, buy किंवा sell करत नाही.
- `/api/account` हा Binance private account proxy आहे; पण सध्याच्या frontend मध्ये account/balance UI त्याला जोडलेला नाही.
- नवीन Web Push backend worker कडून `CRITICAL` signal आला की subscribed devices कडे पाठवतो. सध्या `CRITICAL` हा `RETAIL_TRAP_BHEED` rule साठीच आहे.

## 2. मुख्य तंत्रज्ञान आणि project रचना

| भाग | तंत्रज्ञान / मुख्य फाइल |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| PWA | `vite-plugin-pwa`, Workbox, Web App Manifest |
| Backend | Node.js ES modules, Express, Axios, CORS, dotenv |
| Market stream | Binance REST API + Binance WebSocket, `ws` |
| Indicators | `technicalindicators` |
| Push delivery | `web-push`, VAPID |
| Frontend entry point | [`src/main.tsx`](./src/main.tsx) |
| मुख्य React app/state | [`src/App.tsx`](./src/App.tsx) |
| Frontend rule engine | [`src/utils/trapEngine.ts`](./src/utils/trapEngine.ts) |
| Frontend Binance REST | [`src/services/binanceApi.ts`](./src/services/binanceApi.ts) |
| Backend API आणि worker startup | [`server.js`](./server.js) |
| Backend market worker/rules | [`backend/marketWorker.js`](./backend/marketWorker.js) |
| Backend Push/VAPID/storage | [`backend/pushNotifications.js`](./backend/pushNotifications.js) |
| Browser subscription client | [`src/services/pushNotifications.ts`](./src/services/pushNotifications.ts) |
| Background service worker | [`src/sw.js`](./src/sw.js) |
| Settings UI | [`src/components/SettingsModal.tsx`](./src/components/SettingsModal.tsx) |
| PWA manifest | [`public/manifest.json`](./public/manifest.json) |
| Vite/PWA build configuration | [`vite.config.ts`](./vite.config.ts) |
| Env template | [`.env.example`](./.env.example) |

`@google/genai` dependency package manifest मध्ये आहे; source search मध्ये या app च्या market classification साठी त्याचा वापर आढळलेला नाही. त्या engine चे सध्याचे काम deterministic technical-indicator rules करतात.

## 3. Runtime आणि data flow

### 3.1 Browser मधील live market dashboard

1. `src/main.tsx` React app mount करतो आणि `registerSW({ immediate: true })` ने PWA service worker register करतो.
2. `App.tsx` browser localStorage मधून निवडलेले coins आणि alert preferences वाचतो. सुरुवातीची यादी BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT; एका browser मध्ये जास्तीत जास्त 5 coins निवडता येतात. निवड localStorage मुळे पुढच्या browser visit साठी जतन होते.
3. निवडलेल्या प्रत्येक coin साठी चार timeframe मधील 100 Binance klines मागवले जातात: `1m`, `5m`, `1h`, `4h`. REST calls अनुक्रमे होतात आणि candle history जास्तीत जास्त 120 नोंदी ठेवते.
4. Binance combined WebSocket मधून selected coins साठी ticker, 1m आणि 5m klines येतात. `!ticker@arr` मधून search modal साठी market tickers मिळतात.
5. WebSocket update बंद/failed झाल्यास reconnect प्रयत्न होतात. `1h` आणि `4h` REST history ठरावीक मोठ्या interval ने refresh होते.
6. Frontend backend चा `GET /api/market-status?symbols=...` endpoint दर 5 सेकंदांनी poll करून selected symbols backend worker ला देतो. Backend snapshot उपलब्ध असल्यास त्या symbol चे backend analysis UI मध्ये प्राधान्याने दिसते; browser-side analysis हा fallback आहे.
7. UI dashboard वर active signal, selected coin, live price, indicator votes, volume ratio, wick, range आणि नियमांचे स्पष्टीकरण दाखवतो.

Frontend मधील मुख्य REST helper public Binance hosts मध्ये fallback करतो. Backend worker सुद्धा public Binance REST hosts आणि स्वतंत्र WebSocket वापरतो. त्यामुळे dashboard data मिळवण्याचे दोन स्वतंत्र execution paths आहेत—browser आणि backend. Backend चालू नसला तरी browser path काही dashboard data पुरवू शकतो; मात्र background push साठी चालू backend worker आवश्यक आहे.

### 3.2 Backend market worker

`server.js` Express API सुरू करतो आणि HTTP server ऐकू लागल्यावर market worker start करतो. `backend/marketWorker.js`:

- Default ने पाच USDT symbols track करतो; `TRACKED_SYMBOLS` ने 1–5 symbols configure करता येतात.
- Startup वेळी प्रत्येक symbol साठी चार timeframe चा market history bootstrap करतो.
- Binance ticker/kline WebSocket update वर in-memory candle, ticker आणि analysis snapshot refresh करतो.
- `GET /api/market-status` द्वारे हा snapshot frontend ला देतो; response no-cache आहे.
- `1h` history तासाने आणि `4h` history चार तासांनी refresh करतो.
- REST वर Binance `418`/`429` rate-limit response आल्यास ठरावीक काळ REST request थांबवतो.
- Backend market state RAM मध्ये आहे; process restart झाल्यावर market history पुन्हा bootstrap होते.

Frontend दर पाच सेकंदांनी backend polling करताना selected symbols `GET /api/market-status?symbols=...` मधून पाठवतो. Backend 1–5 USDT symbols validate करून सूची बदलल्यास worker ची WebSocket stream आणि bootstrap नव्या watchlist साठी पुन्हा सुरू करतो. समान यादी आल्यास worker reconnect/bootstrap करत नाही. `TRACKED_SYMBOLS` ही initial/default यादी आणि query न पाठवणाऱ्या clients साठी fallback आहे. `GET /api/health` छोटा worker-status response देतो आणि watchlist बदलत नाही.

### 3.3 Signal calculation

Analysis साठी प्रत्येक timeframe मध्ये किमान 100 candles आणि आवश्यक closed data लागतो. अपुरा/invalid data असल्यास engine analysis न देता `null` देतो. वापरलेले 10 indicator votes (`1m` व `5m` दोन्हीवर स्वतंत्र):

1. RSI(14)
2. MACD(12,26,9)
3. EMA(20)
4. EMA(50)
5. SMA(50)
6. Stochastic(14,3,3)
7. CCI(20)
8. ADX(14)
9. Williams %R(14)
10. Bollinger Bands(20,2)

प्रत्येक indicator साठी BUY/SELL/NEUTRAL mapping code मध्ये स्पष्ट आहे. Sentiment `EXTREME BULLISH` तेव्हाच होते जेव्हा **1m आणि 5m दोन्हीवर स्वतंत्रपणे किमान 7/10 BUY** असतात; `EXTREME BEARISH` साठी दोन्हीवर किमान 7/10 SELL लागतात. इतर वेळी MIXED.

`1h` आणि `4h` मधील closed price विरुद्ध EMA-50 वापरून macro trend ठरतो. दोन्ही bullish असतील तर combined macro BULLISH; दोन्ही bearish असतील तर BEARISH; मतभेद असल्यास NEUTRAL.

Rule order मध्ये पहिला जुळणारा signal परत होतो:

| क्रम | Signal | मुख्य अटी | Severity / कृती |
|---|---|---|---|
| 1 | `STOP_LOSS_HUNT_ENTRY` | दोन्ही higher timeframe bullish; 1m आणि 5m वर extreme bearish votes; मागील 15-candle support खाली sweep करून close support वर; lower wick >50%; volume मागील 20-candle average पेक्षा >1.5x | `OPPORTUNITY`, `ENTRY` |
| 2 | `FAKE_BREAKOUT` | दोन्ही higher timeframe bearish; 1m आणि 5m वर extreme bullish votes; 1m high मागील 15-candle resistance वर; volume average पेक्षा कमी | `WARNING`, `AVOID` |
| 3 | `RETAIL_TRAP_BHEED` | दोन्ही lower timeframe वर extreme bullish votes; सलग 3 green 1m candles; volume non-increasing/plateauing | `CRITICAL`, `AVOID` |
| 4 | `NEUTRAL_SCANNING` | वरीलपैकी कोणताही rule जुळला नाही | `NEUTRAL`, `WATCH` |

Fake breakout rule, Retail FOMO पेक्षा आधी तपासला जातो. UI मध्ये असलेली “retail” किंवा “operator” भाषा algorithm च्या labels आहेत; बाजारातील सहभागींची खरी ओळख नाही.

## 4. Web Push कसे काम करते?

### 4.1 Subscription तयार करणे

1. User Settings मधील **Background push notifications** enable करतो.
2. Browser notification permission मागितली जाते.
3. `navigator.serviceWorker.ready` नंतर app backend च्या `GET /api/push/public-key` कडून VAPID public key मिळवतो.
4. Browser `PushManager.subscribe()` वापरून त्या browser/device साठी subscription तयार करतो.
5. `POST /api/push/subscribe` त्या subscription चा endpoint आणि encryption keys backend कडे पाठवतो. Backend endpoint HTTPS व अनुमत push provider host वर आहे का आणि keys चे format योग्य आहे का तपासतो.
6. Backend subscription `PUSH_SUBSCRIPTIONS_FILE` मध्ये JSON स्वरूपात जतन करतो. Default path `./data/push-subscriptions.json`; `.gitignore` मध्ये हा data आणि temporary files वगळलेले आहेत.

Settings toggle disable केल्यावर `DELETE /api/push/subscribe` subscription backend मधून काढतो आणि browser subscription unsubscribe करतो. Expired endpoint (HTTP 404/410) मिळाल्यास backend त्या subscription ला स्वतः storage मधून काढतो.

### 4.2 Signal ते push notification

1. Backend worker analysis refresh करतो.
2. `createSignalNotifier()` प्रत्येक symbol साठी आधीचा push-trigger signal state ठेवतो. तोच severity/type signal सतत प्रत्येक WebSocket update वरून पुन्हा पुन्हा notify होऊ नये म्हणून notification फक्त transition वेळी देतो; neutral state नंतर तोच signal पुन्हा आला तर alert पुन्हा निघतो.
3. Backend push पाठवण्याची अट `CRITICAL`, `OPPORTUNITY`, किंवा `WARNING` severity आहे. सध्याचे rules या तिन्ही severity ला वेगवेगळे patterns देतात. Engine probability score काढत नाही; हे rule-based qualitative severity labels आहेत.
4. `web-push` VAPID ने encrypt/sign केलेला payload प्रत्येक saved subscription endpoint कडे पाठवतो.
5. `src/sw.js` browser app बंद असतानाही push event प्राप्त करून `showNotification()` दाखवतो. Notification click केल्यावर app उघडण्याचा/फोकस करण्याचा प्रयत्न करतो.

ही प्रक्रिया app/browser/OS परवानगी देत असल्यास app window बंद असतानाही चालू शकते. मात्र ती “प्रत्येक परिस्थितीत हमखास” नाही: browser ने site notifications block केली असतील, device offline असेल, browser push service उपलब्ध नसेल, backend/worker बंद किंवा suspended असेल, subscription expired असेल किंवा subscription storage हरवले असेल तर delivery होणार नाही.

### 4.3 Push API endpoints

| Method | Endpoint | काम |
|---|---|---|
| `GET` | `/api/push/public-key` | configured VAPID public key frontend ला देतो; configure नसल्यास 503 |
| `POST` | `/api/push/subscribe` | browser subscription validate करून persistent JSON file मध्ये जतन |
| `DELETE` | `/api/push/subscribe` | endpoint वरून subscription काढतो |
| `GET` | `/api/market-status?symbols=...` | watchlist sync करून live worker snapshot |
| `GET` | `/api/health` | लहान uptime/worker status; watchlist बदलत नाही |
| `GET` | `/api/account` | Binance signed account proxy; सध्या UI मध्ये जोडलेला नाही |

JSON request body साठी Express limit 16 KB आहे. Push endpoint URL validation हे arbitrary URL कडे server-side notification पाठवण्याचा धोका कमी करण्यासाठी HTTPS आणि ज्ञात push provider host allowlist करतो.

## 5. PWA व Settings मधील इतर क्षमता

- `public/manifest.json`: App चे नाव, standalone display, theme/background रंग आणि icons.
- `vite.config.ts`: `injectManifest` strategy ने project चा custom `src/sw.js` production service worker मध्ये bundle/precache करतो.
- `src/main.tsx`: PWA service worker त्वरित register करतो.
- Service worker precache/navigation fallback पुरवतो; market data किंवा Binance WebSocket offline cache करत नाही.
- Settings मध्ये install prompt, background push on/off, notification permission status, voice alert toggle, voice style आणि test voice आहे.
- Selected coins आणि alert preferences browser localStorage मध्ये असतात; backend account किंवा user profile प्रणाली नाही.
- Search आणि coin selection, mobile navigation/drawer, rule analysis card हे UI components मध्ये विभागलेले आहेत.

## 6. Local setup आणि environment

1. Node.js install करा आणि project root मध्ये `npm install --legacy-peer-deps` चालवा. Vite/esbuild peer dependency resolution conflict आल्यामुळे या project साठी legacy peer-deps flag वापरावा लागतो.
2. `.env.example` वरून `.env` तयार करा. Binance credentials आवश्यक आहेत, कारण `server.js` keys नसल्यास startup थांबवतो.
3. `npx web-push generate-vapid-keys` ने VAPID key pair बनवा; backend `.env` मध्ये:
   - `VAPID_PUBLIC_KEY` — frontend ला API द्वारे परत दिली जाते; secret नाही.
   - `VAPID_PRIVATE_KEY` — फक्त backend secret; frontend किंवा `VITE_` variable मध्ये कधीही ठेवू नका.
   - `VAPID_SUBJECT` — `mailto:` contact किंवा VAPID साठी contact URL.
   - `PUSH_SUBSCRIPTIONS_FILE` — subscription JSON file path.
4. Backend: `npm run start:server` (default port 5000).
5. Frontend: `npm run dev` (Vite port 3000).
6. Frontend `VITE_BACKEND_URL` (`src/services/backendApi.ts`) वापरून backend URL ठरवतो. Local testing साठी योग्य backend URL स्पष्ट configure करा. Push साठी deployed site HTTPS वर असणे आवश्यक; localhost हा local-development अपवाद आहे.
7. Backend host वर `PUSH_SUBSCRIPTIONS_FILE` साठी **persistent volume** configure करा. Startup वेळी missing parent directories तयार होतात; deploy नंतर ephemeral filesystem पुसले गेले तर saved subscriptions हरवतील आणि devices पुन्हा subscribe करावी लागतील.
8. Hosting plan परवानगी देत असल्यास बाहेरील HTTP GET monitor दर 10 मिनिटांनी `/api/health` ला ping करायला लावा. हे uptime ची हमी देत नाही किंवा host suspension policy बदलत नाही.

`TRACKED_SYMBOLS` हा backend watchlist; `VITE_BACKEND_URL` frontend-to-backend URL. VAPID private key ला source control, frontend env prefix, report, log किंवा chat मध्ये कधीही ठेवू नका.

## 7. Binance account route आणि security boundaries

`server.js` मध्ये `/api/account` request साठी backend `BINANCE_API_SECRET` वापरून HMAC-SHA256 signature बनवतो; API key `X-MBX-APIKEY` header मध्ये Binance ला पाठवतो. हे secret frontend bundle मध्ये जात नाही. पण:

- Account endpoint साठी app login/authentication किंवा authorization दिसत नाही. Public deployment वर account माहिती उघड होण्यापासून endpoint ला संरक्षण हवे.
- Route ला request rate-limit नाही; CORS हा authentication चा पर्याय नाही.
- Axios account request मध्ये explicit timeout दिसत नाही.
- Server सुरू होण्यासाठी Binance API key/secret दोन्ही बंधनकारक आहेत; फक्त public market data किंवा push वापरायचा असला तरीही ही startup अट लागू राहते.
- `server.js` मधील `allowedOrigins` production domain आणि local ports ची यादी आहे. Deploy केलेल्या frontend चा exact origin त्या यादीत असणे आवश्यक; नवीन preview domains आपोआप परवानगीत येत नाहीत.
- Push subscription POST/DELETE endpoints ला user authentication नाही. Anyone who can reach an allowed-origin endpoint can attempt to register a syntactically valid browser push subscription. Production threat model नुसार access control, origin policy, rate limiting आणि abuse controls तपासणे आवश्यक.
- JSON file storage एकाच backend process/volume साठी साधे persistence देते; horizontal multi-instance deployment साठी shared durable database/queue strategy नाही.
- `vercel.json` frontend SPA fallback configure करतो. Express server आणि long-running market worker त्यातून आपोआप host होत नाहीत. Push/market worker साठी continuously running backend service/deployment स्वतंत्रपणे चालणे गरजेचे.

Binance API key withdrawal permission शिवाय, शक्य असल्यास read-only/IP restriction सह ठेवा. `.env` values उघडू नका; या report मध्ये त्यांचा समावेश नाही.

### Keep-alive monitoring

`GET /api/health` returns service uptime and current market-worker status without changing the watchlist. A time-based external GET monitor (for example cron-job.org, every 10 minutes at `https://YOUR-BACKEND-HOST/api/health`) can reduce idle suspension when the hosting plan considers inbound pings activity. This is not a guarantee of uptime or a way around host limits/policies. Verify current Render plan behavior, monitor response history, and backend logs. The worker and push cannot run while the backend service is actually stopped or suspended.

## 8. चाचणी आणि प्रत्यक्ष तपासणीचा आढावा

अलीकडील local validation:

- `npm run lint` — TypeScript `tsc --noEmit`, यशस्वी.
- `npm test` — 18 tests पास (नवीन watchlist व push-storage/severity cases समाविष्ट); frontend trap rules, backend market analysis/signal transition आणि push persistence/validation/delivery cases.
- `npm run build` — frontend आणि custom `dist/sw.js` production build, यशस्वी.
- Local production preview मध्ये `/sw.js` service worker registration दिसली.

या चाचण्या live push provider पर्यंत खरे notification पोचल्याचा, production CORS/config/storage, किंवा बंद browser/फोनवरील end-to-end delivery चा पुरावा नाहीत. Preview origin `http://127.0.0.1:4173` हा backend CORS allowlist मध्ये नसल्याने backend poll ला CORS block दिसला; deployed frontend चा अचूक origin allowlist मध्ये आहे का पडताळा.

उपलब्ध automated tests:

- [`src/utils/trapEngine.test.ts`](./src/utils/trapEngine.test.ts): पुरेसा data, indicator output, macro agreement, trap rule boundary cases.
- [`backend/marketWorker.test.js`](./backend/marketWorker.test.js): market worker startup snapshot, analysis आणि critical signal transition suppression.
- [`backend/pushNotifications.test.js`](./backend/pushNotifications.test.js): VAPID configuration pair, subscription validation/upsert/persistence, critical-only push delivery आणि expired subscription cleanup.

अजून स्पष्टपणे end-to-end test न झालेले मुद्दे: browser वर user permission flow, प्रत्यक्ष VAPID provider send, backend route + actual persisted volume वर restart, real push click handling, Android/iOS/browser-specific behavior, multi-instance backend आणि real Binance reconnect/rate-limit conditions.

## 9. AI reviewer साठी copy/paste prompt

```text
Review this repository independently. Start with PROJECT_CHECK_REPORT_MR.md only
as orientation; verify every important claim against the current source code.
Do not inspect, print, request, or expose any .env secret or credential.

Check these areas:
1. React/Vite/PWA structure, workbox injectManifest setup, service-worker
   lifecycle, offline assumptions, and notification permission/subscription UX.
2. Binance REST and WebSocket ingestion, candle closed/open handling, MTF
   indicators, 100-candle readiness, reconnect/rate-limit/error paths.
3. Frontend vs backend watchlist consistency, stale/partial backend snapshots,
   and whether the server's analysis actually drives the UI and push path.
4. VAPID setup, browser subscription validation, push endpoint routes, JSON
   persistence, expired subscription cleanup, repeat-signal suppression, and
   whether notifications work when the app window is closed.
5. Security and deployment: account route exposure, CORS exact origins,
   unauthenticated push subscription routes, SSRF protections, filesystem
   durability, serverless/sleeping backend limitations, environment secrets,
   and whether server startup unnecessarily requires Binance credentials.
6. Rule correctness and financial wording. Distinguish code-defined pattern
   labels from evidence of trader identity, probability, guaranteed returns,
   or an actual trade recommendation.
7. Test gaps and reproducible deployment checks.

Report only evidence-backed findings. For each finding give severity
(Critical/High/Medium/Low), exact file and line(s), the vulnerable or incorrect
behavior, concrete impact, confidence 1-10, and a minimal recommendation.
Separate confirmed defects from deployment assumptions and optional improvements.
Do not make code changes. End with a short go-live checklist.
```

## 10. Go-live checklist

- [ ] Production `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` configured on backend; key pair matches.
- [ ] Private VAPID key and Binance secrets are backend-only; no `VITE_` prefix and no committed `.env`.
- [ ] Frontend production origin is exactly allowed by Express CORS; local and preview origins added only when needed.
- [ ] Frontend `VITE_BACKEND_URL` points to the actual running Express backend.
- [ ] Backend runs continuously enough for the long-running worker; the hosting plan's sleep policy and any keep-alive monitor are understood.
- [ ] Frontend polling query and `/api/market-status` response symbols confirm backend watchlist synchronization.
- [ ] Subscription JSON path points at durable persistent storage; restore/redeploy behavior tested.
- [ ] User grants notification permission, push subscription succeeds, then send one real end-to-end test push before relying on alerts.
- [ ] `/api/account` and push subscription endpoints receive an appropriate production authentication/abuse-control review.
- [ ] Signal rules, limitations, and no-automated-trading behavior are understood; this is not financial advice.
