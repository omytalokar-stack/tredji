import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLiveKlines } from './binanceApi';

test('Binance kline fetch retries the next mirror after a rate limit', async () => {
  const originalFetch = globalThis.fetch;
  const requestedHosts: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedHosts.push(url.hostname);
    if (requestedHosts.length === 1) {
      return new Response(JSON.stringify({ msg: 'IP banned' }), {
        status: 418,
        statusText: 'I am a teapot',
      });
    }

    const rows = Array.from({ length: 100 }, (_, index) => {
      const openTime = index * 60_000;
      return [openTime, '100', '101', '99', '100', '10', openTime + 59_999, '1000', 0, '5'];
    });
    return new Response(JSON.stringify(rows), { status: 200 });
  };

  try {
    const candles = await fetchLiveKlines('BTCUSDT', '1m', 100);
    assert.equal(requestedHosts[0], 'api.binance.com');
    assert.equal(requestedHosts[1], 'data-api.binance.vision');
    assert.equal(candles.length, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
