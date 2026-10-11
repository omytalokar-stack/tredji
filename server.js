import crypto from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import { createServer } from 'node:http';
import { createMarketWorker } from './backend/marketWorker.js';
import { createPushNotifications } from './backend/pushNotifications.js';

dotenv.config();

if (!process.env.BINANCE_API_KEY?.trim() || !process.env.BINANCE_API_SECRET?.trim()) {
  console.error('Please add your Binance API keys to the .env file');
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = [
  'https://trapdetector-ai.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '16kb' }));

const pushNotifications = await createPushNotifications();
if (!pushNotifications.enabled) {
  console.warn(
    `Web Push is disabled. ${pushNotifications.configurationError || 'Configure VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.'}`
  );
}
const marketWorker = createMarketWorker({
  onSignal: (analysis) => {
    void pushNotifications.notifySignal(analysis).catch((error) => {
      console.error(`Unable to send push notifications for ${analysis.symbol}:`, error);
    });
  },
});

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime()),
    marketStatus: marketWorker.getSnapshot().status,
  });
});

app.get('/api/market-status', (req, res) => {
  if (req.query.symbols !== undefined) {
    if (typeof req.query.symbols !== 'string') {
      return res.status(400).json({ error: 'Provide tracked symbols as a comma-separated string.' });
    }
    try {
      marketWorker.setSymbols(req.query.symbols.split(','));
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Unable to synchronize the market watchlist:', error);
      return res.status(500).json({ error: 'Unable to synchronize the market watchlist.' });
    }
  }
  res.set('Cache-Control', 'no-store');
  return res.json(marketWorker.getSnapshot());
});

app.get('/api/push/public-key', (_req, res) => {
  if (!pushNotifications.enabled) {
    return res.status(503).json({
      error: pushNotifications.configurationError || 'Web Push is not configured on this server.',
    });
  }
  res.set('Cache-Control', 'no-store');
  return res.json({ publicKey: pushNotifications.publicKey });
});

app.post('/api/push/subscribe', async (req, res) => {
  if (!pushNotifications.enabled) {
    return res.status(503).json({
      error: pushNotifications.configurationError || 'Web Push is not configured on this server.',
    });
  }
  try {
    await pushNotifications.addSubscription(req.body);
    return res.status(201).json({ ok: true });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Unable to save push subscription:', error);
    return res.status(500).json({ error: 'Unable to save push subscription.' });
  }
});

app.delete('/api/push/subscribe', async (req, res) => {
  if (!pushNotifications.enabled) {
    return res.status(503).json({
      error: pushNotifications.configurationError || 'Web Push is not configured on this server.',
    });
  }
  try {
    await pushNotifications.removeSubscription(req.body?.endpoint);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Unable to remove push subscription:', error);
    return res.status(500).json({ error: 'Unable to remove push subscription.' });
  }
});

function createSignature(queryString) {
  return crypto
    .createHmac('sha256', process.env.BINANCE_API_SECRET)
    .update(queryString)
    .digest('hex');
}

app.get('/api/account', async (_req, res) => {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createSignature(queryString);

  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      {
        headers: {
          'X-MBX-APIKEY': process.env.BINANCE_API_KEY,
        },
      }
    );

    res.json(response.data);
  } catch {
    console.error('Binance account request failed');
    res.status(500).json({ error: 'Failed to fetch Binance account data' });
  }
});

const server = createServer(app);

server.listen(port, () => {
  console.log(`TrapDetector AI proxy listening on port ${port}`);
  marketWorker.start();
});

function shutdown(signal) {
  console.log(`${signal} received; stopping market worker and HTTP server.`);
  marketWorker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
