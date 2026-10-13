import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { ATR } from 'technicalindicators';
import { createMarketWorker, createSignalNotifier, makeAnalysis } from './marketWorker.js';

const durations = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
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

function makeBinanceRows(timeframe) {
  return makeCandles(timeframe).map((candle) => [
    candle.openTime,
    String(candle.open),
    String(candle.high),
    String(candle.low),
    String(candle.close),
    String(candle.volume),
    candle.closeTime,
    String(candle.quoteVolume),
    0,
    String(candle.takerBuyVolume),
  ]);
}

class FakeWebSocket extends EventEmitter {
  close() {}
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('Timed out waiting for worker state.');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

test('worker exposes a warming-up snapshot before history is loaded', () => {
  const worker = createMarketWorker({ symbols: ['BTCUSDT'] });
  const snapshot = worker.getSnapshot();
  assert.equal(snapshot.status, 'warming_up');
  assert.equal(snapshot.readySymbols, 0);
  assert.equal(snapshot.streamConnected, false);
  assert.equal(snapshot.symbols[0].analysis, null);
  assert.deepEqual(Object.keys(snapshot.symbols[0].candles), ['1m', '5m', '15m']);
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

test('worker retries failed history, logs the exact error, and resumes signal analysis', async () => {
  let firstKlineFailures = 0;
  const logs = [];
  const signals = [];
  const worker = createMarketWorker({
    symbols: ['BTCUSDT'],
    WebSocketImpl: FakeWebSocket,
    bootstrapRetryBaseMs: 2,
    bootstrapRetryMaxMs: 8,
    logger: { error: (message) => logs.push(message) },
    onSignal: (signal) => signals.push(signal),
    requestMarketData: async (path) => {
      if (path.includes('/klines?')) {
        const timeframe = new URLSearchParams(path.split('?')[1]).get('interval');
        if (timeframe === '1m' && firstKlineFailures < 3) {
          firstKlineFailures += 1;
          throw new Error('HTTP 503: upstream unavailable');
        }
        return makeBinanceRows(timeframe);
      }
      return {
        lastPrice: '100',
        priceChangePercent: '1',
        highPrice: '110',
        lowPrice: '90',
        volume: '100',
        quoteVolume: '10000',
      };
    },
  });

  worker.start();
  await waitFor(() => worker.getSnapshot().readySymbols === 1);
  const snapshot = worker.getSnapshot();

  assert.equal(snapshot.status, 'partial');
  assert.equal(snapshot.symbols[0].analysis.signalType, 'RETAIL_TRAP_BHEED');
  assert.ok(signals.some((signal) => signal.signalType === 'RETAIL_TRAP_BHEED'));
  assert.ok(logs.some((message) => message.includes('HTTP 503: upstream unavailable')));
  assert.ok(logs.some((message) => message.includes('retrying in 2ms')));
  assert.ok(logs.some((message) => message.includes('retrying in 4ms')));
  assert.ok(logs.some((message) => message.includes('retrying in 8ms')));
  assert.equal(snapshot.symbols[0].error, null);
  worker.stop();
});

test('worker cancels pending bootstrap retries when stopped or watchlist changes', async () => {
  let calls = 0;
  const worker = createMarketWorker({
    symbols: ['BTCUSDT'],
    WebSocketImpl: FakeWebSocket,
    bootstrapRetryBaseMs: 20,
    bootstrapRetryMaxMs: 20,
    logger: { error: () => {} },
    requestMarketData: async () => {
      calls += 1;
      throw new Error('REST unavailable');
    },
  });

  worker.start();
  await waitFor(() => calls > 0);
  assert.equal(worker.setSymbols(['ETHUSDT']), true);
  await waitFor(() => calls > 1);
  worker.stop();
  const callsAtStop = calls;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(calls, callsAtStop);
});

test('server engine computes all ten LTF indicator votes and an MTF signal', () => {
  const candles = {
    '1m': makeCandles('1m'),
    '5m': makeCandles('5m'),
    '15m': makeCandles('15m'),
  };
  const analysis = makeAnalysis(makeTicker(), candles);
  assert.ok(analysis);
  assert.equal(analysis.indicatorVotes.length, 10);
  assert.equal(analysis.macroTrend, 'BULLISH');
  assert.equal(analysis.retailSentiment, 'EXTREME BULLISH');
  assert.equal(analysis.signalType, 'RETAIL_TRAP_BHEED');
  assert.ok(Number.isFinite(analysis.suggestedSL));
  assert.ok(Number.isFinite(analysis.suggestedTarget));
  const candles1m = candles['1m'];
  const entry = candles1m.at(-1).close;
  const atr = ATR.calculate({
    period: 14,
    high: candles1m.map((candle) => candle.high),
    low: candles1m.map((candle) => candle.low),
    close: candles1m.map((candle) => candle.close),
  }).at(-1);
  const expectedStop = Math.max(...candles1m.slice(-5).map((candle) => candle.high)) + atr;
  assert.equal(analysis.suggestedSL, expectedStop);
  assert.equal(analysis.suggestedTarget, entry - 2 * (expectedStop - entry));
});

test('server engine calculates a 1:2 LONG plan for a stop-loss hunt signal', () => {
  const candles = {
    '1m': makeCandles('1m', 'DOWN'),
    '5m': makeCandles('5m', 'DOWN'),
    '15m': makeCandles('15m', 'UP'),
  };
  const oneMinute = candles['1m'];
  const support = Math.min(...oneMinute.slice(-16, -1).map((candle) => candle.low));
  oneMinute[oneMinute.length - 1] = {
    ...oneMinute.at(-1),
    open: support + 0.2,
    high: support + 0.4,
    low: support - 2,
    close: support + 0.05,
    volume: 20,
  };

  const analysis = makeAnalysis(makeTicker(), candles);
  assert.equal(analysis?.signalType, 'STOP_LOSS_HUNT_ENTRY');
  const entry = oneMinute.at(-1).close;
  const atr = ATR.calculate({
    period: 14,
    high: oneMinute.map((candle) => candle.high),
    low: oneMinute.map((candle) => candle.low),
    close: oneMinute.map((candle) => candle.close),
  }).at(-1);
  const expectedStop = Math.min(...oneMinute.slice(-5).map((candle) => candle.low)) - atr;
  assert.equal(analysis?.suggestedSL, expectedStop);
  assert.equal(analysis?.suggestedTarget, entry + 2 * (entry - expectedStop));
});

test('server engine blocks analysis when any timeframe is short of 100 candles', () => {
  const candles = {
    '1m': makeCandles('1m'),
    '5m': makeCandles('5m'),
    '15m': makeCandles('15m').slice(1),
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
