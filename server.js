import crypto from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import { createServer } from 'node:http';
import { createMarketWorker } from './backend/marketWorker.js';

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
app.use(express.json());

const marketWorker = createMarketWorker();

app.get('/api/market-status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(marketWorker.getSnapshot());
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
