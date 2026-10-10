import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Candle,
  LiveCoinTicker,
  MultiTimeframeCandles,
  Timeframe,
} from '../types/crypto';
import { analyzeMarketTrap } from './trapEngine';

function makeCandles(
  timeframe: Timeframe,
  count = 100,
  closeOffset = 0
): Candle[] {
  const intervalMs: Record<Timeframe, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
  };
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.08 + Math.sin(index * 0.31) * 0.35 + closeOffset;
    const openTime = index * intervalMs[timeframe];
    return {
      openTime,
      closeTime: openTime + intervalMs[timeframe] - 1,
      open: close - 0.04,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 10 + (index % 5),
      quoteVolume: close * (10 + (index % 5)),
      takerBuyVolume: 5,
      isClosed: true,
    };
  });
}

function makeTicker(price = 108): LiveCoinTicker {
  return {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price,
    priceChangePercent: 0,
    high24h: 110,
    low24h: 90,
    volume24h: 100,
    quoteVolume24h: 10_000,
    lastUpdated: 1,
  };
}

function makeTimeframes(): MultiTimeframeCandles {
  return {
    '1m': makeCandles('1m'),
    '5m': makeCandles('5m'),
    '1h': makeCandles('1h'),
    '4h': makeCandles('4h'),
  };
}

function makeTrendCandles(timeframe: Timeframe, trend: 'UP' | 'DOWN'): Candle[] {
  const interval: Record<Timeframe, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
  };
  return Array.from({ length: 100 }, (_, index) => {
    const close = trend === 'UP' ? 50 + index * 0.5 : 150 - index * 0.5;
    const openTime = index * interval[timeframe];
    return {
      openTime,
      closeTime: openTime + interval[timeframe] - 1,
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

function makeTrendingTimeframes(
  lowerTrend: 'UP' | 'DOWN',
  higherTrend: 'UP' | 'DOWN'
): MultiTimeframeCandles {
  return {
    '1m': makeTrendCandles('1m', lowerTrend),
    '5m': makeTrendCandles('5m', lowerTrend),
    '1h': makeTrendCandles('1h', higherTrend),
    '4h': makeTrendCandles('4h', higherTrend),
  };
}

test('blocks analysis until all four timeframes have 100 candles', () => {
  const candles = makeTimeframes();
  candles['4h'] = makeCandles('4h', 99);
  assert.equal(analyzeMarketTrap(makeTicker(), candles), null);
});

test('calculates ten indicators per lower timeframe and both EMA-50 macro trends', () => {
  const analysis = analyzeMarketTrap(makeTicker(), makeTimeframes());

  assert.ok(analysis);
  assert.equal(analysis.indicatorVotes.length, 10);
  assert.equal(analysis.macroTrend, 'BULLISH');
  assert.equal(analysis.oneHourTrend, 'BULLISH');
  assert.equal(analysis.fourHourTrend, 'BULLISH');
  assert.ok(analysis.avgVolume20 > 0);
  assert.ok(Number.isFinite(analysis.volumeRatio));
});

test('does not create numeric confidence or trap scores', () => {
  const analysis = analyzeMarketTrap(makeTicker(), makeTimeframes());

  assert.ok(analysis);
  assert.equal('trapScore' in analysis, false);
  assert.equal('confidence' in analysis, false);
});

test('does not report macro bullish when the hourly and four-hour trends disagree', () => {
  const candles = makeTimeframes();
  const lastFourHourCandle = candles['4h'][candles['4h'].length - 1];
  candles['4h'][candles['4h'].length - 1] = {
    ...lastFourHourCandle,
    open: 70,
    high: 71,
    low: 69,
    close: 70,
  };

  const analysis = analyzeMarketTrap(makeTicker(), candles);
  assert.equal(analysis?.macroTrend, 'NEUTRAL');
});

test('detects stop-loss entry only with bullish macro and bearish lower-timeframe consensus', () => {
  const candles = makeTrendingTimeframes('DOWN', 'UP');
  const oneMinute = candles['1m'];
  const support = Math.min(...oneMinute.slice(-16, -1).map((candle) => candle.low));
  oneMinute[oneMinute.length - 1] = {
    ...oneMinute[oneMinute.length - 1],
    open: support + 0.2,
    high: support + 0.4,
    low: support - 2,
    close: support + 0.05,
    volume: 20,
  };

  const analysis = analyzeMarketTrap(makeTicker(), candles);
  assert.equal(analysis?.macroTrend, 'BULLISH');
  assert.equal(analysis?.retailSentiment, 'EXTREME BEARISH');
  assert.equal(analysis?.signalType, 'STOP_LOSS_HUNT_ENTRY');
});

test('fake breakout takes precedence when breakout and retail FOMO both match', () => {
  const candles = makeTrendingTimeframes('UP', 'DOWN');
  const oneMinute = candles['1m'];
  const resistance = Math.max(...oneMinute.slice(-16, -1).map((candle) => candle.high));
  const close = resistance + 0.2;
  oneMinute[oneMinute.length - 1] = {
    ...oneMinute[oneMinute.length - 1],
    open: close - 0.1,
    high: resistance + 1,
    low: close - 0.2,
    close,
    volume: 1,
  };

  const analysis = analyzeMarketTrap(makeTicker(close), candles);
  assert.equal(analysis?.macroTrend, 'BEARISH');
  assert.equal(analysis?.retailSentiment, 'EXTREME BULLISH');
  assert.equal(analysis?.signalType, 'FAKE_BREAKOUT');
  assert.match(analysis?.actionAdvice ?? '', /BLOCK BUY/);
});

test('detects retail FOMO only with extreme bullish 1m and 5m consensus', () => {
  const analysis = analyzeMarketTrap(
    makeTicker(),
    makeTrendingTimeframes('UP', 'UP')
  );

  assert.equal(analysis?.retailSentiment, 'EXTREME BULLISH');
  assert.equal(analysis?.signalType, 'RETAIL_TRAP_BHEED');
  assert.match(analysis?.actionAdvice ?? '', /DO NOT CHASE/);
});
