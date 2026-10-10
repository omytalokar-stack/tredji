import crypto from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';

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
];

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

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

app.listen(port, () => {
  console.log(`TrapDetector AI proxy listening on port ${port}`);
});
