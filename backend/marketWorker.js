import axios from 'axios';
import {
  adx,
  ATR,
  BollingerBands,
  CCI,
  EMA,
  MACD,
  RSI,
  SMA,
  Stochastic,
  WilliamsR,
} from 'technicalindicators';
import { WebSocket } from 'ws';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
const TIMEFRAMES = ['1m', '5m', '15m'];
const CANDLE_LIMIT = 120;
const BASELINE_COUNT = 20;
const SUPPORT_COUNT = 15;
const REQUIRED_COUNT = 100;
const BINANCE_REST_BASES = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
];
let binanceRateLimitUntil = 0;
let binanceRequestQueue = Promise.resolve();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const emptyTimeframes = () => ({ '1m': [], '5m': [], '15m': [] });

export function normalizeSymbols(inputSymbols) {
  if (!Array.isArray(inputSymbols) || inputSymbols.length < 1 || inputSymbols.length > 5) {
    throw new TypeError('Tracked symbols must contain 1-5 comma-separated Binance USDT symbols.');
  }
  const symbols = [...new Set(inputSymbols.map((symbol) =>
    typeof symbol === 'string' ? symbol.trim().toUpperCase() : ''
  ))];
  if (
    symbols.length < 1 ||
    symbols.length > 5 ||
    symbols.some((symbol) => !/^[A-Z0-9]{2,20}USDT$/.test(symbol))
  ) {
    throw new TypeError('Tracked symbols must contain 1-5 comma-separated Binance USDT symbols.');
  }
  return symbols;
}

function readSymbols(rawSymbols = process.env.TRACKED_SYMBOLS) {
  if (!rawSymbols?.trim()) return DEFAULT_SYMBOLS;
  return normalizeSymbols(rawSymbols.split(','));
}

function mergeCandles(existing, incoming) {
  const byOpenTime = new Map(existing.map((candle) => [candle.openTime, candle]));
  for (const candle of incoming) {
    const previous = byOpenTime.get(candle.openTime);
    if (!previous || candle.isClosed || candle.closeTime >= previous.closeTime) {
      byOpenTime.set(candle.openTime, candle);
    }
  }
  return [...byOpenTime.values()]
    .sort((first, second) => first.openTime - second.openTime)
    .slice(-CANDLE_LIMIT);
}

function parseKline(row, now = Date.now()) {
  const candle = {
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6]),
    quoteVolume: Number(row[7]),
    takerBuyVolume: Number(row[9]),
    isClosed: Number(row[6]) < now,
  };
  if (
    Object.values(candle).some((value) => typeof value === 'number' && !Number.isFinite(value)) ||
    candle.open <= 0 ||
    candle.close <= 0 ||
    candle.high < candle.low ||
    candle.volume < 0
  ) {
    throw new Error('Binance returned an invalid kline.');
  }
  return candle;
}

async function delayWithSignal(milliseconds, signal) {
  if (signal?.aborted) throw new Error('Binance REST request cancelled.');
  if (!signal) return delay(milliseconds);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('Binance REST request cancelled.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchBinance(path, signal) {
  const request = binanceRequestQueue.then(async () => {
    const waitMs = binanceRateLimitUntil - Date.now();
    if (waitMs > 0) await delayWithSignal(waitMs, signal);
    let lastError;
    for (const base of BINANCE_REST_BASES) {
      if (signal?.aborted) throw new Error('Binance REST request cancelled.');
      try {
        return (await axios.get(`${base}${path}`, {
          timeout: 12_000,
          signal,
          headers: { Accept: 'application/json' },
        })).data;
      } catch (error) {
        if (signal?.aborted) throw new Error('Binance REST request cancelled.');
        lastError = error;
        const status = error?.response?.status;
        if (status === 418 || status === 429) {
          const now = Date.now();
          const retryAfter = Number(error.response.headers?.['retry-after']);
          const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 0;
          const responseMessage = typeof error.response.data?.msg === 'string'
            ? error.response.data.msg
            : '';
          const banUntil = Number(responseMessage.match(/banned until (\d+)/i)?.[1]);
          binanceRateLimitUntil = Math.max(
            now + retryAfterMs,
            Number.isFinite(banUntil) && banUntil > now ? banUntil : 0,
            now + (retryAfterMs ? 0 : 60_000)
          );
          throw new Error(
            `Binance rate limit response HTTP ${status}${responseMessage ? `: ${responseMessage}` : ''}; REST refresh paused until ${new Date(binanceRateLimitUntil).toISOString()}.`
          );
        }
      }
    }
    const status = lastError?.response?.status;
    const responseMessage = lastError?.response?.data?.msg;
    const details = status
      ? `HTTP ${status}${responseMessage ? `: ${responseMessage}` : ''}`
      : lastError?.code
        ? `${lastError.code}: ${lastError.message}`
        : lastError?.message ?? 'unknown error';
    throw new Error(`Unable to fetch Binance public market data: ${details}`);
  });
  binanceRequestQueue = request.catch(() => {});
  return request;
}

function finiteCandles(candles) {
  return candles.every((candle) =>
    [candle.openTime, candle.closeTime, candle.open, candle.high, candle.low, candle.close, candle.volume]
      .every(Number.isFinite) &&
    candle.open > 0 &&
    candle.high >= candle.low &&
    candle.volume >= 0
  );
}

function latest(values) {
  return values.at(-1);
}

function calculateRiskLevels(candles, entry, direction) {
  const closed = candles.filter((candle) => candle.isClosed);
  const atr = latest(ATR.calculate({
    period: 14,
    high: closed.map((candle) => candle.high),
    low: closed.map((candle) => candle.low),
    close: closed.map((candle) => candle.close),
  }));
  const lastFive = closed.slice(-5);
  if (atr === undefined || !Number.isFinite(atr) || lastFive.length < 5) return null;

  const suggestedSL = direction === 'LONG'
    ? Math.min(...lastFive.map((candle) => candle.low)) - atr
    : Math.max(...lastFive.map((candle) => candle.high)) + atr;
  const risk = direction === 'LONG' ? entry - suggestedSL : suggestedSL - entry;
  if (!Number.isFinite(suggestedSL) || !Number.isFinite(risk) || risk <= 0) return null;

  return {
    suggestedSL,
    suggestedTarget: direction === 'LONG' ? entry + 2 * risk : entry - 2 * risk,
  };
}

function countDirection(directions, direction) {
  return directions.filter((item) => item === direction).length;
}

function evaluateIndicators(candles) {
  const closed = candles.filter((candle) => candle.isClosed);
  if (closed.length < 50 || !finiteCandles(closed)) return null;

  const close = closed.map((candle) => candle.close);
  const high = closed.map((candle) => candle.high);
  const low = closed.map((candle) => candle.low);
  const directions = [];

  const rsi = latest(RSI.calculate({ period: 14, values: close }));
  if (rsi === undefined) return null;
  directions.push(rsi < 30 || (rsi >= 50 && rsi <= 70) ? 'BUY' : rsi > 70 || rsi < 50 ? 'SELL' : 'NEUTRAL');

  const macd = latest(MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }));
  if (macd?.MACD === undefined || macd.signal === undefined) return null;
  directions.push(macd.MACD > macd.signal ? 'BUY' : macd.MACD < macd.signal ? 'SELL' : 'NEUTRAL');

  const ema20 = latest(EMA.calculate({ period: 20, values: close }));
  const ema50 = latest(EMA.calculate({ period: 50, values: close }));
  const sma50 = latest(SMA.calculate({ period: 50, values: close }));
  const currentClose = latest(close);
  if ([ema20, ema50, sma50, currentClose].some((value) => value === undefined)) return null;
  directions.push(currentClose > ema20 ? 'BUY' : currentClose < ema20 ? 'SELL' : 'NEUTRAL');
  directions.push(currentClose > ema50 ? 'BUY' : currentClose < ema50 ? 'SELL' : 'NEUTRAL');
  directions.push(currentClose > sma50 ? 'BUY' : currentClose < sma50 ? 'SELL' : 'NEUTRAL');

  const stochastic = latest(Stochastic.calculate({ high, low, close, period: 14, signalPeriod: 3 }));
  if (!stochastic) return null;
  directions.push(stochastic.k > stochastic.d ? 'BUY' : stochastic.k < stochastic.d ? 'SELL' : 'NEUTRAL');

  const cci = latest(CCI.calculate({ high, low, close, period: 20 }));
  if (cci === undefined) return null;
  directions.push(cci > 0 ? 'BUY' : cci < 0 ? 'SELL' : 'NEUTRAL');

  const adxResult = latest(adx({ high, low, close, period: 14 }));
  if (!adxResult) return null;
  directions.push(
    adxResult.adx >= 20 && adxResult.pdi > adxResult.mdi
      ? 'BUY'
      : adxResult.adx >= 20 && adxResult.mdi > adxResult.pdi
        ? 'SELL'
        : 'NEUTRAL'
  );

  const williams = latest(WilliamsR.calculate({ high, low, close, period: 14 }));
  if (williams === undefined) return null;
  directions.push(williams > -50 ? 'BUY' : williams < -50 ? 'SELL' : 'NEUTRAL');

  const bands = latest(BollingerBands.calculate({ period: 20, stdDev: 2, values: close }));
  if (!bands) return null;
  directions.push(currentClose > bands.middle ? 'BUY' : currentClose < bands.middle ? 'SELL' : 'NEUTRAL');
  return directions;
}

function macroTrend(candles) {
  const closes = candles.filter((candle) => candle.isClosed).map((candle) => candle.close);
  if (closes.length < 50) return 'NEUTRAL';
  const ema50 = latest(EMA.calculate({ period: 50, values: closes }));
  const price = latest(closes);
  if (ema50 === undefined || price === undefined) return 'NEUTRAL';
  return price > ema50 ? 'BULLISH' : price < ema50 ? 'BEARISH' : 'NEUTRAL';
}

function getCombinedSentiment(oneMinute, fiveMinute) {
  const oneMinuteBuy = countDirection(oneMinute, 'BUY');
  const fiveMinuteBuy = countDirection(fiveMinute, 'BUY');
  const oneMinuteSell = countDirection(oneMinute, 'SELL');
  const fiveMinuteSell = countDirection(fiveMinute, 'SELL');
  if (oneMinuteBuy >= 7 && fiveMinuteBuy >= 7) {
    return {
      sentiment: 'EXTREME BULLISH',
      buyCount: Math.min(oneMinuteBuy, fiveMinuteBuy),
      sellCount: Math.max(oneMinuteSell, fiveMinuteSell),
    };
  }
  if (oneMinuteSell >= 7 && fiveMinuteSell >= 7) {
    return {
      sentiment: 'EXTREME BEARISH',
      buyCount: Math.max(oneMinuteBuy, fiveMinuteBuy),
      sellCount: Math.min(oneMinuteSell, fiveMinuteSell),
    };
  }
  return {
    sentiment: 'MIXED',
    buyCount: Math.min(oneMinuteBuy, fiveMinuteBuy),
    sellCount: Math.min(oneMinuteSell, fiveMinuteSell),
  };
}

function getStrongBullishConsensus(oneMinute, fiveMinute) {
  return countDirection(oneMinute, 'BUY') >= 7 && countDirection(fiveMinute, 'BUY') >= 7;
}

function getStrongBearishConsensus(oneMinute, fiveMinute) {
  return countDirection(oneMinute, 'SELL') >= 7 && countDirection(fiveMinute, 'SELL') >= 7;
}

function getBandState(candles) {
  const closed = candles.filter((candle) => candle.isClosed);
  const closes = closed.map((candle) => candle.close);
  if (closes.length < 20) return null;
  const bands = latest(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }));
  if (!bands) return null;
  const recent = closes.slice(-20);
  const bandWidth = bands.upper - bands.lower;
  const squeeze = bandWidth < (Math.max(...recent) - Math.min(...recent)) * 0.6;
  return { upper: bands.upper, lower: bands.lower, squeeze };
}

function makeAnalysis(ticker, candles) {
  if (TIMEFRAMES.some((timeframe) =>
    candles[timeframe].length < REQUIRED_COUNT || !finiteCandles(candles[timeframe])
  )) return null;

  const oneMinute = evaluateIndicators(candles['1m']);
  const fiveMinute = evaluateIndicators(candles['5m']);
  if (!oneMinute || !fiveMinute) return null;

  const closedOneMinute = candles['1m']
    .filter((candle) => candle.isClosed)
    .sort((first, second) => first.openTime - second.openTime);
  const currentCandle = latest(closedOneMinute);
  const history = closedOneMinute.slice(-21, -1);
  if (!currentCandle || history.length !== BASELINE_COUNT) return null;

  const fifteenMinuteTrend = macroTrend(candles['15m']);
  const oneHourTrend = fifteenMinuteTrend;
  const fourHourTrend = fifteenMinuteTrend;
  const macro = fifteenMinuteTrend;
  const consensus = getCombinedSentiment(oneMinute, fiveMinute);
  const names = [
    'RSI(14)', 'MACD(12,26,9)', 'EMA(20)', 'EMA(50)', 'SMA(50)',
    'Stochastic(14,3,3)', 'CCI(20)', 'ADX(14)', 'Williams %R(14)', 'Bollinger Bands',
  ];
  const indicatorVotes = names.map((name, index) => ({
    name,
    oneMinute: oneMinute[index],
    fiveMinute: fiveMinute[index],
    direction: oneMinute[index] === fiveMinute[index] ? oneMinute[index] : 'NEUTRAL',
  }));

  const avgVolume20 = history.reduce((sum, candle) => sum + candle.volume, 0) / BASELINE_COUNT;
  if (avgVolume20 <= 0) return null;
  const currentVolume = currentCandle.volume;
  const volumeRatio = currentVolume / avgVolume20;
  const recentCandles = closedOneMinute.slice(-SUPPORT_COUNT - 1, -1);
  if (recentCandles.length !== SUPPORT_COUNT) return null;
  const recentSupport = Math.min(...recentCandles.map((candle) => candle.low));
  const recentResistance = Math.max(...recentCandles.map((candle) => candle.high));
  const candleRange = currentCandle.high - currentCandle.low;
  if (candleRange <= 0) return null;
  const lowerWickRatio =
    (Math.min(currentCandle.open, currentCandle.close) - currentCandle.low) / candleRange;
  const lastThree = closedOneMinute.slice(-3);
  const threeGreen = lastThree.length === 3 && lastThree.every((candle, index) =>
    candle.close > candle.open &&
    (index === 0 || candle.close > lastThree[index - 1].close)
  );
  const volumePlateau = lastThree.length === 3 &&
    lastThree[0].volume >= lastThree[1].volume &&
    lastThree[1].volume >= lastThree[2].volume;
  const closedFiveMinute = candles['5m'].filter((candle) => candle.isClosed).sort((first, second) => first.openTime - second.openTime);
  const currentFiveMinute = latest(closedFiveMinute);
  const fiveMinuteEMA50 = latest(EMA.calculate({
    period: 50,
    values: closedFiveMinute.map((candle) => candle.close),
  }));
  const fiveMinutePullbackTouch = currentFiveMinute && fiveMinuteEMA50 !== undefined &&
    currentFiveMinute.close >= fiveMinuteEMA50 * 0.995 &&
    currentFiveMinute.close <= fiveMinuteEMA50 * 1.005;
  const goldenPullback = fifteenMinuteTrend === 'BULLISH' &&
    fiveMinutePullbackTouch &&
    getStrongBullishConsensus(oneMinute, fiveMinute) &&
    volumeRatio > 1.5;
  const bandState = getBandState(candles['1m']) ?? getBandState(candles['5m']);
  const bullishBreakout = bandState && bandState.squeeze &&
    currentCandle.close > bandState.upper &&
    getStrongBullishConsensus(oneMinute, fiveMinute) &&
    volumeRatio > 1.5;
  const bearishBreakout = bandState && bandState.squeeze &&
    currentCandle.close < bandState.lower &&
    getStrongBearishConsensus(oneMinute, fiveMinute) &&
    volumeRatio > 1.5;
  const base = {
    symbol: ticker.symbol,
    baseAsset: ticker.baseAsset,
    currentPrice: ticker.price,
    priceChangePercent: ticker.priceChangePercent,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    currentVolume,
    avgVolume20,
    volumeRatio,
    lowerWickRatio,
    recentSupport,
    recentResistance,
    macroTrend: macro,
    oneHourTrend,
    fourHourTrend,
    retailSentiment: consensus.sentiment,
    retailBuyCount: consensus.buyCount,
    retailSellCount: consensus.sellCount,
    indicatorVotes,
    timestamp: Date.now(),
  };

  if (goldenPullback) {
    const riskLevels = calculateRiskLevels(candles['1m'], currentCandle.close, 'LONG');
    if (!riskLevels) return null;
    return {
      ...base,
      ...riskLevels,
      signalType: 'SCALP_OPPORTUNITY',
      severity: 'OPPORTUNITY',
      badgeText: 'GOLDEN PULLBACK · 15M TREND',
      headline: 'Golden Pullback. Fast bullish continuation setup.',
      taglineHindi: '15m trend bullish, EMA-50 touch, and 1m/5m sentiment remains strong.',
      actionAdvice: 'SCALP LONG ENTRY. Buy the pullback only if price holds the 15m EMA-50 and 1m/5m consensus remains positive.',
      actionType: 'ENTRY',
      beginnerExplanation: 'The 15m trend is bullish, price is pulling back to the EMA-50, and both 1m and 5m indicator panels show strong bullish consensus with a volume spike.',
      detailedAnalysis: [
        `15m trend: ${fifteenMinuteTrend}.`,
        `1m/5m bullish consensus: ${countDirection(oneMinute, 'BUY')}/10 and ${countDirection(fiveMinute, 'BUY')}/10 BUY.`,
        `1m volume is ${volumeRatio.toFixed(2)}x the prior 20-candle average.`,
      ],
    };
  }

  if (bullishBreakout || bearishBreakout) {
    const riskLevels = calculateRiskLevels(candles['1m'], currentCandle.close, bullishBreakout ? 'LONG' : 'SHORT');
    if (!riskLevels) return null;
    return {
      ...base,
      ...riskLevels,
      signalType: 'SCALP_OPPORTUNITY',
      severity: 'OPPORTUNITY',
      badgeText: 'BOLLINGER SQUEEZE · BREAKOUT',
      headline: bullishBreakout ? 'Bollinger Squeeze Breakout. Bullish continuation.' : 'Bollinger Squeeze Breakout. Bearish continuation.',
      taglineHindi: bullishBreakout
        ? 'Bands are compressed and price is breaking out with strong volume on bullish momentum.'
        : 'Bands are compressed and price is breaking down with strong volume on bearish momentum.',
      actionAdvice: bullishBreakout
        ? 'SCALP LONG. Breakout confirmed only with 1m/5m bullish consensus and elevated volume.'
        : 'SCALP SHORT. Breakdown confirmed only with 1m/5m bearish consensus and elevated volume.',
      actionType: 'ENTRY',
      beginnerExplanation: 'The 1m and 5m bands are squeezed, price is clearing the range, and volume expands while 1m/5m consensus validates the breakout direction.',
      detailedAnalysis: [
        bullishBreakout
          ? `Bullish breakout above the squeeze zone: ${bandState.upper.toLocaleString()}.`
          : `Bearish breakdown below the squeeze zone: ${bandState.lower.toLocaleString()}.`,
        `1m/5m strict consensus check passed: ${bullishBreakout ? 'BUY' : 'SELL'} across 7/10 indicator votes.`,
        `Current 1m volume is ${volumeRatio.toFixed(2)}x the prior 20-candle average.`,
      ],
    };
  }

  const supportSweep = currentCandle.low < recentSupport && currentCandle.close > recentSupport;
  if (
    macro === 'BULLISH' &&
    consensus.sentiment === 'EXTREME BEARISH' &&
    supportSweep &&
    lowerWickRatio > 0.5 &&
    volumeRatio > 1.5
  ) {
    const riskLevels = calculateRiskLevels(candles['1m'], currentCandle.close, 'LONG');
    if (!riskLevels) return null;
    return {
      ...base,
      ...riskLevels,
      signalType: 'STOP_LOSS_HUNT_ENTRY',
      severity: 'OPPORTUNITY',
      badgeText: 'HTF BULLISH · RETAIL PANIC · SUPPORT SWEEP',
      headline: 'Stop-Loss Hunt Detected. Retailers are trapped.',
      taglineHindi: 'Retail panic aur bullish higher-timeframe trend.',
      actionAdvice: 'SMART MONEY BUY. Rule conditions matched; this is not proof of trader identity or a guaranteed outcome.',
      actionType: 'ENTRY',
      beginnerExplanation: 'The 15m trend is bullish, both lower timeframes show extreme bearish indicator consensus, and the closed 1m candle swept and reclaimed support with a long lower wick and a volume spike.',
      detailedAnalysis: [
        `Macro trend: 15m ${oneHourTrend}.`,
        `Retail consensus: ${consensus.sellCount}/10 SELL on both 1m and 5m.`,
        `Support ${recentSupport.toLocaleString()}, wick ${(lowerWickRatio * 100).toFixed(1)}%, volume ${volumeRatio.toFixed(2)}x average.`,
      ],
    };
  }

  if (
    macro === 'BEARISH' &&
    consensus.sentiment === 'EXTREME BULLISH' &&
    currentCandle.high > recentResistance &&
    volumeRatio < 1
  ) {
    return {
      ...base,
      signalType: 'FAKE_BREAKOUT',
      severity: 'WARNING',
      badgeText: 'BULLISH CONSENSUS · LOW-VOLUME BREAKOUT',
      headline: 'Fake Breakout / Operator Trap. No Real Money.',
      taglineHindi: 'Retail greed ke saath breakout, par volume average se neeche.',
      actionAdvice: 'BLOCK BUY. Do not chase a breakout without average 1m volume.',
      actionType: 'AVOID',
      beginnerExplanation: 'Both lower timeframes show extreme bullish indicator consensus, but the 1m candle exceeded the prior 15-candle high on below-average volume.',
      detailedAnalysis: [
        `Retail consensus: ${consensus.buyCount}/10 BUY on both 1m and 5m.`,
        `Prior 15-candle high: ${recentResistance.toLocaleString()}; signal high: ${currentCandle.high.toLocaleString()}.`,
        `Signal volume is ${volumeRatio.toFixed(2)}x the prior 20-candle average.`,
      ],
    };
  }

  if (consensus.sentiment === 'EXTREME BULLISH' && threeGreen && volumePlateau) {
    const riskLevels = calculateRiskLevels(candles['1m'], currentCandle.close, 'SHORT');
    if (!riskLevels) return null;
    return {
      ...base,
      ...riskLevels,
      signalType: 'RETAIL_TRAP_BHEED',
      severity: 'CRITICAL',
      badgeText: 'RETAIL FOMO · VOLUME PLATEAU',
      headline: 'Retailers Trap Alert! Bheed aa rahi hai.',
      taglineHindi: 'Strong retail consensus; three green candles but volume is not rising.',
      actionAdvice: 'DO NOT CHASE. BLOCK BUY while bullish consensus meets weakening candle volume.',
      actionType: 'AVOID',
      beginnerExplanation: 'Both 1m and 5m indicator consensus is extreme bullish, but the last three completed 1m candles are green and their volume is plateauing or dropping.',
      detailedAnalysis: [
        `Retail consensus: ${consensus.buyCount}/10 BUY on both 1m and 5m.`,
        'Three consecutive green 1m candles confirmed.',
        'Volume across those candles is non-increasing.',
      ],
    };
  }

  return {
    ...base,
    signalType: 'NEUTRAL_SCANNING',
    severity: 'NEUTRAL',
    badgeText: 'NO MASTER RULE TRIGGERED',
    headline: 'No Defined Pattern Detected',
    taglineHindi: 'MTF consensus and 1m trap conditions do not align.',
    actionAdvice: 'No entry signal. Wait for the required higher-timeframe and lower-timeframe conditions.',
    actionType: 'WATCH',
    beginnerExplanation: 'All ten indicators are calculated on both 1m and 5m data. A setup is shown only when the specified macro, consensus, and 1m candle rules align.',
    detailedAnalysis: [
      `Macro trend: 15m ${oneHourTrend}.`,
      `Consensus: 1m ${countDirection(oneMinute, 'BUY')}/10 BUY, ${countDirection(oneMinute, 'SELL')}/10 SELL; 5m ${countDirection(fiveMinute, 'BUY')}/10 BUY, ${countDirection(fiveMinute, 'SELL')}/10 SELL.`,
      `1m signal volume: ${currentVolume.toLocaleString()} vs prior 20-candle average ${avgVolume20.toLocaleString()} (${volumeRatio.toFixed(2)}x).`,
    ],
  };
}

export function createSignalNotifier(onSignal = () => {}) {
  const previousPushSignals = new Map();
  return (analysis) => {
    const previousSignal = previousPushSignals.get(analysis.symbol);
    const shouldNotify = ['CRITICAL', 'OPPORTUNITY', 'WARNING'].includes(analysis.severity);
    const currentSignal = shouldNotify
      ? `${analysis.severity}:${analysis.signalType}`
      : null;
    previousPushSignals.set(analysis.symbol, currentSignal);
    if (currentSignal && currentSignal !== previousSignal) onSignal(analysis);
  };
}

export function createMarketWorker({
  symbols = readSymbols(),
  onStatus = () => {},
  onSignal = () => {},
  requestMarketData = (path, { signal } = {}) => fetchBinance(path, signal),
  WebSocketImpl = WebSocket,
  bootstrapRetryBaseMs = 1_000,
  bootstrapRetryMaxMs = 60_000,
  logger = console,
} = {}) {
  let trackedSymbols = normalizeSymbols(symbols);
  let market = new Map(trackedSymbols.map((symbol) => [
    symbol,
    { ticker: null, candles: emptyTimeframes(), analysis: null, lastUpdated: null, error: null },
  ]));
  const notifySignal = createSignalNotifier(onSignal);
  let watchlistGeneration = 0;
  let startedAt = Date.now();
  let lastUpdated = null;
  let lastError = null;
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let started = false;
  let stopped = false;
  let streamConnected = false;
  let lastMessageAt = null;
  let fifteenMinuteTimer = null;
  let refreshInProgress = false;
  let bootstrapController = null;

  const publishUpdate = (entry) => {
    entry.analysis = entry.ticker ? makeAnalysis(entry.ticker, entry.candles) : null;
    entry.lastUpdated = Date.now();
    entry.error = Object.values(entry.bootstrapErrors ?? {})[0] ?? null;
    lastUpdated = entry.lastUpdated;
    lastError = [...market.values()].find((item) => item.error)?.error ?? null;
    if (entry.analysis) notifySignal(entry.analysis);
    onStatus();
  };

  const fetchKlines = async (
    symbol,
    timeframe,
    generation = watchlistGeneration,
    signal
  ) => {
    const path = `/klines?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&limit=100`;
    const rows = await requestMarketData(path, { signal });
    if (stopped || generation !== watchlistGeneration) return;
    if (!Array.isArray(rows) || rows.length !== 100) {
      throw new Error(`Binance did not return 100 ${timeframe} candles for ${symbol}.`);
    }
    const incoming = rows.map((row) => parseKline(row));
    const entry = market.get(symbol);
    if (!entry) return;
    entry.candles[timeframe] = mergeCandles(entry.candles[timeframe], incoming);
    if (entry.ticker) publishUpdate(entry);
  };

  const bootstrap = () => {
    bootstrapController?.abort();
    if (stopped) return;
    const controller = new AbortController();
    bootstrapController = controller;
    const generation = watchlistGeneration;
    const symbolsToBootstrap = [...trackedSymbols];
    const isCurrent = () =>
      !controller.signal.aborted &&
      !stopped &&
      generation === watchlistGeneration;

    const retryUntilSuccess = async (symbol, resource, operation) => {
      let attempt = 0;
      while (isCurrent()) {
        try {
          await operation();
          if (!isCurrent()) return false;
          const entry = market.get(symbol);
          if (entry?.bootstrapErrors) {
            delete entry.bootstrapErrors[resource];
            entry.error = Object.values(entry.bootstrapErrors)[0] ?? null;
            lastError = [...market.values()].find((item) => item.error)?.error ?? null;
            onStatus();
          }
          return true;
        } catch (error) {
          if (!isCurrent()) return false;
          const entry = market.get(symbol);
          if (!entry) return false;
          const message = error instanceof Error ? error.message : String(error);
          entry.bootstrapErrors ??= {};
          entry.bootstrapErrors[resource] = message;
          entry.error = Object.values(entry.bootstrapErrors)[0] ?? message;
          lastError = entry.error;
          const waitMs = Math.min(
            bootstrapRetryBaseMs * (2 ** attempt),
            bootstrapRetryMaxMs
          );
          attempt += 1;
          logger.error(
            `Market bootstrap failed for ${symbol} ${resource} (attempt ${attempt}); retrying in ${waitMs}ms: ${message}`
          );
          onStatus();
          try {
            await delayWithSignal(waitMs, controller.signal);
          } catch {
            return false;
          }
        }
      }
      return false;
    };

    return (async () => {
      for (const symbol of symbolsToBootstrap) {
        if (!isCurrent()) return;
        const entry = market.get(symbol);
        if (!entry) continue;
        for (const timeframe of TIMEFRAMES) {
          if (!isCurrent()) return;
          const succeeded = await retryUntilSuccess(
            symbol,
            `klines ${timeframe}`,
            () => fetchKlines(symbol, timeframe, generation, controller.signal)
          );
          if (!succeeded) return;
          try {
            await delayWithSignal(150, controller.signal);
          } catch {
            return;
          }
        }
        if (!isCurrent()) return;
        const tickerSucceeded = await retryUntilSuccess(symbol, '24hr ticker', async () => {
          const data = await requestMarketData(
            `/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
            { signal: controller.signal }
          );
          if (!isCurrent()) return;
          entry.ticker = {
            symbol,
            baseAsset: symbol.replace(/USDT$/, ''),
            quoteAsset: 'USDT',
            price: Number(data.lastPrice),
            priceChangePercent: Number(data.priceChangePercent),
            high24h: Number(data.highPrice),
            low24h: Number(data.lowPrice),
            volume24h: Number(data.volume),
            quoteVolume24h: Number(data.quoteVolume),
            lastUpdated: Date.now(),
          };
          if (Object.values(entry.ticker).some((value) =>
            typeof value === 'number' && !Number.isFinite(value)
          )) {
            throw new Error(`Binance returned an invalid 24hr ticker for ${symbol}.`);
          }
          publishUpdate(entry);
        });
        if (tickerSucceeded) {
          try {
            await delayWithSignal(150, controller.signal);
          } catch {
            return;
          }
        }
      }
      if (isCurrent()) onStatus();
    })();
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delayMs = Math.min(1000 * (2 ** reconnectAttempt), 30_000);
    reconnectAttempt += 1;
    lastError = `Binance WebSocket disconnected; retrying in ${Math.ceil(delayMs / 1000)}s.`;
    console.warn(lastError);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
    onStatus();
  };

  function connect() {
    if (stopped || socket) return;
    const streams = trackedSymbols.flatMap((symbol) => [
      `${symbol.toLowerCase()}@ticker`,
      ...TIMEFRAMES.map((timeframe) => `${symbol.toLowerCase()}@kline_${timeframe}`),
    ]).join('/');
    try {
      socket = new WebSocketImpl(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      const currentSocket = socket;
      currentSocket.on('open', () => {
        if (socket !== currentSocket) return;
        streamConnected = true;
        reconnectAttempt = 0;
        lastError = [...market.values()].find((item) => item.error)?.error ?? null;
        onStatus();
        console.info(`Binance market worker connected for ${trackedSymbols.join(', ')}.`);
      });
      currentSocket.on('message', (raw) => {
        if (stopped || socket !== currentSocket) return;
        try {
          const envelope = JSON.parse(raw.toString());
          const data = envelope?.data;
          if (!data || typeof data.s !== 'string') return;
          lastMessageAt = Date.now();
          const symbol = data.s.toUpperCase();
          const entry = market.get(symbol);
          if (!entry) return;

          if (data.e === '24hrTicker') {
            const ticker = {
              symbol,
              baseAsset: symbol.replace(/USDT$/, ''),
              quoteAsset: 'USDT',
              price: Number(data.c),
              priceChangePercent: Number(data.P),
              high24h: Number(data.h),
              low24h: Number(data.l),
              volume24h: Number(data.v),
              quoteVolume24h: Number(data.q),
              lastUpdated: Date.now(),
            };
            if (Object.values(ticker).some((value) => typeof value === 'number' && !Number.isFinite(value))) return;
            entry.ticker = ticker;
            publishUpdate(entry);
            return;
          }
          if (data.e !== 'kline' || !data.k) return;
          const timeframe = data.k.i;
          if (!TIMEFRAMES.includes(timeframe)) return;
          const candle = parseKline([
            data.k.t,
            data.k.o,
            data.k.h,
            data.k.l,
            data.k.c,
            data.k.v,
            data.k.T,
            data.k.q,
            0,
            data.k.V,
          ]);
          candle.isClosed = data.k.x === true;
          entry.candles[timeframe] = mergeCandles(entry.candles[timeframe], [candle]);
          if (entry.ticker) entry.ticker = { ...entry.ticker, price: candle.close, lastUpdated: Date.now() };
          publishUpdate(entry);
        } catch (error) {
          console.error('Invalid Binance WebSocket message ignored:', error.message);
        }
      });
      currentSocket.on('error', (error) => {
        if (socket !== currentSocket) return;
        console.error('Binance market worker WebSocket error:', error.message);
        currentSocket.close();
      });
      currentSocket.on('close', () => {
        if (socket !== currentSocket) return;
        socket = null;
        streamConnected = false;
        scheduleReconnect();
      });
    } catch (error) {
      socket = null;
      console.error('Unable to initialize Binance market worker WebSocket:', error.message);
      scheduleReconnect();
    }
  }

  const refreshTimeframe = async (timeframe) => {
    if (refreshInProgress || stopped) return;
    refreshInProgress = true;
    const generation = watchlistGeneration;
    try {
      for (const symbol of [...trackedSymbols]) {
        if (stopped || generation !== watchlistGeneration) return;
        try {
          await fetchKlines(symbol, timeframe, generation);
          await delay(150);
        } catch (error) {
          if (generation !== watchlistGeneration) return;
          const entry = market.get(symbol);
          if (!entry) continue;
          entry.error = error.message;
          lastError = error.message;
          console.error(`Scheduled ${timeframe} refresh failed for ${symbol}:`, error.message);
        }
      }
    } finally {
      refreshInProgress = false;
      onStatus();
    }
  };

  function getSnapshot() {
    const symbolsState = trackedSymbols.map((symbol) => {
      const entry = market.get(symbol);
      return {
        symbol,
        ticker: entry.ticker,
        candles: entry.candles,
        analysis: entry.analysis,
        lastUpdated: entry.lastUpdated,
        error: entry.error,
      };
    });
    const readySymbols = symbolsState.filter((item) => item.analysis !== null).length;
    return {
      status: readySymbols === trackedSymbols.length && streamConnected
        ? 'live'
        : readySymbols > 0
          ? 'partial'
          : 'warming_up',
      symbols: symbolsState,
      startedAt,
      updatedAt: lastUpdated,
      streamConnected,
      lastMessageAt,
      readySymbols,
      lastError,
    };
  }

  function start() {
    if (started || stopped) return;
    started = true;
    startedAt = Date.now();
    connect();
    void bootstrap();
    fifteenMinuteTimer = setInterval(() => void refreshTimeframe('15m'), 5 * 60 * 1000);
  }

  function stop() {
    stopped = true;
    bootstrapController?.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (fifteenMinuteTimer) clearInterval(fifteenMinuteTimer);
    reconnectTimer = null;
    fifteenMinuteTimer = null;
    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.removeAllListeners();
      currentSocket.close();
    }
  }

  function setSymbols(nextSymbols) {
    const normalizedSymbols = normalizeSymbols(nextSymbols);
    if (
      normalizedSymbols.length === trackedSymbols.length &&
      normalizedSymbols.every((symbol, index) => symbol === trackedSymbols[index])
    ) {
      return false;
    }

    trackedSymbols = normalizedSymbols;
    watchlistGeneration += 1;
    bootstrapController?.abort();
    market = new Map(trackedSymbols.map((symbol) => [
      symbol,
      market.get(symbol) ?? {
        ticker: null,
        candles: emptyTimeframes(),
        analysis: null,
        lastUpdated: null,
        error: null,
      },
    ]));
    streamConnected = false;
    reconnectAttempt = 0;

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;

    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.removeAllListeners();
      currentSocket.close();
    }

    if (started && !stopped) {
      connect();
      void bootstrap();
    }
    onStatus();
    return true;
  }

  return { start, stop, getSnapshot, setSymbols };
}

export { makeAnalysis, readSymbols };
