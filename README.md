# TrapDetector AI

The Binance API secret is kept on the backend. The frontend should call the
proxy endpoint rather than access Binance account endpoints directly.

**Prerequisites:** Node.js

## Run locally

1. Install dependencies with `npm install --legacy-peer-deps`.
2. Add your Binance API key and secret to `.env`. Keep `.env` private and do
   not commit it.
3. Generate a VAPID key pair with `npx web-push generate-vapid-keys` and add
   the public key and private key to the backend `.env`. Optionally set
   `VAPID_SUBJECT` to a contact address; it defaults to the app URL. Keep the
   private key secret and use the same key pair for every backend instance.
4. Start the backend proxy and market worker with `npm run start:server`
   (listens on port 5000).
5. In another terminal, start the frontend with `npm run dev`.

The account proxy is available at `GET http://localhost:5000/api/account`.
The frontend uses `VITE_BACKEND_URL` to reach this backend. Push notifications
require HTTPS in production (localhost is allowed for local development).

## Backend watchlist and keep-alive

The frontend sends its active coin list with every market poll:
`GET /api/market-status?symbols=BTCUSDT,ETHUSDT`. The backend validates the
1-5 USDT symbols and reconfigures the market worker's Binance stream and candle
bootstrap when the list changes. The list remains in sync on the next poll
(normally within five seconds after a selection change). The legacy
`TRACKED_SYMBOLS` environment variable supplies the worker's initial list and
is used by requests that do not include `symbols`.

`GET /api/health` returns a small service/worker status response without
changing the active watchlist. To reduce idle suspension on hosting plans that
allow inbound requests to wake or keep a service active, configure an external
monitor such as cron-job.org:

1. Create a time-based HTTP GET monitor/job.
2. Set its URL to `https://YOUR-BACKEND-HOST/api/health`.
3. Set the interval to every 10 minutes and enable failure notifications.
4. Check the monitor's response history and the backend's own logs after
   deployment.

An external ping is only a keep-alive aid, not an uptime guarantee. Render
free-tier policies, maintenance, cold starts, limits, or service suspension
can still interrupt the worker; confirm the current hosting plan supports
this use. Push delivery still requires the backend worker to be running and
connected to Binance.

## Web Push deployment

Configure `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the backend environment
only. `VAPID_SUBJECT` is optional and defaults to the app URL. The public key is exposed to the app by
`GET /api/push/public-key`; never place the private key in a `VITE_` variable.
The app registers the push-capable service worker and manages device
subscriptions through `POST /api/push/subscribe` and
`DELETE /api/push/subscribe`.

Subscriptions are stored in `PUSH_SUBSCRIPTIONS_FILE` (default
`./data/push-subscriptions.json`). Attach persistent storage to the backend
host and set this variable to a file on that volume so subscriptions survive
deploys and restarts. The backend creates missing parent directories on
startup. Run the backend as a continuously running Node.js service: its market
worker sends push notifications when a symbol enters a new `CRITICAL`,
`OPPORTUNITY`, or `WARNING` signal state. The app does not calculate signal
probabilities; these are rule-defined severity labels, not high-probability
estimates. Expired device subscriptions are removed automatically. Users
enable or disable background push notifications in the app's Settings; the
browser must grant notification permission.
