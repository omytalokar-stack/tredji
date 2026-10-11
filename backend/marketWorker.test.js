import assert from 'node:assert/strict';
import test from 'node:test';
import { createMarketWorker, createSignalNotifier, makeAnalysis } from './marketWorker.js';

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

test('worker syncs its active watchlist, retains shared symbols, and ignores unchanged lists', () => {
  const worker = createMarketWorker({ symbols: ['BTCUSDT', 'ETHUSDT'] });
  const initialEthCandles = worker.getSnapshot().symbols[1].candles;

  assert.equal(worker.setSymbols(['ethusdt', 'SOLUSDT']), true);
  const updatedSymbols = worker.getSnapshot().symbols;
  assert.deepEqual(updatedSymbols.map(({ symbol }) => symbol), ['ETHUSDT', 'SOLUSDT']);
  assert.strictEqual(updatedSymbols[0].candles, initialEthCandles);
  assert.equal(worker.setSymbols(['ETHUSDT', 'SOLUSDT']), false);
  assert.throws(() => worker.setSymbols([]), /1-5/);
  assert.throws(() => worker.setSymbols(['BTCUSD']), /1-5/);
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

test('push notifier sends critical, opportunity and warning signals once per transition', () => {
  const received = [];
  const notify = createSignalNotifier((analysis) =>
    received.push(`${analysis.severity}:${analysis.signalType}`)
  );
  const opportunitySignal = {
    symbol: 'BTCUSDT', severity: 'OPPORTUNITY', signalType: 'STOP_LOSS_HUNT_ENTRY',
  };
  const warningSignal = { symbol: 'BTCUSDT', severity: 'WARNING', signalType: 'FAKE_BREAKOUT' };
  const criticalSignal = { symbol: 'BTCUSDT', severity: 'CRITICAL', signalType: 'RETAIL_TRAP_BHEED' };

  notify(opportunitySignal);
  notify(opportunitySignal);
  notify(warningSignal);
  notify(warningSignal);
  notify(criticalSignal);
  notify(criticalSignal);
  notify({ ...criticalSignal, severity: 'NEUTRAL', signalType: 'NEUTRAL_SCANNING' });
  notify(criticalSignal);

  assert.deepEqual(received, [
    'OPPORTUNITY:STOP_LOSS_HUNT_ENTRY',
    'WARNING:FAKE_BREAKOUT',
    'CRITICAL:RETAIL_TRAP_BHEED',
    'CRITICAL:RETAIL_TRAP_BHEED',
  ]);
});
