import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketWorker, makeAnalysis } from './marketWorker.js';

const durations = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
};

function makeCandles(timeframe, trend = 'UP') {
  return Array.from({ length: 100 }, (_, index) => {
    const close = trend === 'UP' ? 50 + index * 0.5 : 150 - index * 0.5;
    const openTime = index * durations[timeframe];
    return {
      openTime,
      closeTime: openTime + durations[timeframe] - 1,
      open: close - 0.02,
      high: close + 0.05,
      low: close - 0.05,
      close,
      volume: 10,
      quoteVolume: close * 10,
      takerBuyVolume: 5,
      isClosed: true,
    };
  });
}

function makeTicker() {
  return {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 100,
    priceChangePercent: 1,
    high24h: 110,
    low24h: 90,
    volume24h: 100,
    quoteVolume24h: 10_000,
    lastUpdated: Date.now(),
  };
}

test('worker exposes a warming-up snapshot before history is loaded', () => {
  const worker = createMarketWorker({ symbols: ['BTCUSDT'] });
  const snapshot = worker.getSnapshot();
  assert.equal(snapshot.status, 'warming_up');
  assert.equal(snapshot.readySymbols, 0);
  assert.equal(snapshot.streamConnected, false);
  assert.equal(snapshot.symbols[0].analysis, null);
  assert.deepEqual(Object.keys(snapshot.symbols[0].candles), ['1m', '5m', '1h', '4h']);
});

test('server engine computes all ten LTF indicator votes and an MTF signal', () => {
  const candles = {
    '1m': makeCandles('1m'),
    '5m': makeCandles('5m'),
    '1h': makeCandles('1h'),
    '4h': makeCandles('4h'),
  };
  const analysis = makeAnalysis(makeTicker(), candles);
  assert.ok(analysis);
  assert.equal(analysis.indicatorVotes.length, 10);
  assert.equal(analysis.macroTrend, 'BULLISH');
  assert.equal(analysis.retailSentiment, 'EXTREME BULLISH');
  assert.equal(analysis.signalType, 'RETAIL_TRAP_BHEED');
});

test('server engine blocks analysis when any timeframe is short of 100 candles', () => {
  const candles = {
    '1m': makeCandles('1m'),
    '5m': makeCandles('5m'),
    '1h': makeCandles('1h'),
    '4h': makeCandles('4h').slice(1),
  };
  assert.equal(makeAnalysis(makeTicker(), candles), null);
});
