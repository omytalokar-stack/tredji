import axios from 'axios';
import {
  adx,
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
const TIMEFRAMES = ['1m', '5m', '1h', '4h'];
const CANDLE_LIMIT = 120;
const BASELINE_COUNT = 20;
const SUPPORT_COUNT = 15;
const REQUIRED_COUNT = 100;
const BINANCE_REST_BASES = [
  'https://api.binance.com/api/v3',
  'https://data-api.binance.vision/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
];
let binanceRateLimitUntil = 0;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const emptyTimeframes = () => ({ '1m': [], '5m': [], '1h': [], '4h': [] });

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

async function fetchBinance(path) {
  const waitMs = binanceRateLimitUntil - Date.now();
  if (waitMs > 0) await delay(waitMs);
  let lastError;
  for (const base of BINANCE_REST_BASES) {
    try {
      return (await axios.get(`${base}${path}`, {
        timeout: 12_000,
        headers: { Accept: 'application/json' },
      })).data;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      if (status === 418 || status === 429) {
        const retryAfter = Number(error.response.headers?.['retry-after']);
        binanceRateLimitUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 60_000);
        throw new Error(`Binance rate limit response HTTP ${status}; REST refresh stopped.`);
      }
    }
  }
  throw new Error(`Unable to fetch Binance public market data: ${lastError?.message ?? 'unknown error'}`);
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

  const oneHourTrend = macroTrend(candles['1h']);
  const fourHourTrend = macroTrend(candles['4h']);
  const macro = oneHourTrend === 'BULLISH' && fourHourTrend === 'BULLISH'
    ? 'BULLISH'
    : oneHourTrend === 'BEARISH' && fourHourTrend === 'BEARISH'
      ? 'BEARISH'
      : 'NEUTRAL';
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

  const supportSweep = currentCandle.low < recentSupport && currentCandle.close > recentSupport;
  if (
    macro === 'BULLISH' &&
    consensus.sentiment === 'EXTREME BEARISH' &&
    supportSweep &&
    lowerWickRatio > 0.5 &&
    volumeRatio > 1.5
  ) {
    return {
      ...base,
      signalType: 'STOP_LOSS_HUNT_ENTRY',
      severity: 'OPPORTUNITY',
      badgeText: 'HTF BULLISH · RETAIL PANIC · SUPPORT SWEEP',
      headline: 'Stop-Loss Hunt Detected. Retailers are trapped.',
      taglineHindi: 'Retail panic aur bullish higher-timeframe trend.',
      actionAdvice: 'SMART MONEY BUY. Rule conditions matched; this is not proof of trader identity or a guaranteed outcome.',
      actionType: 'ENTRY',
      beginnerExplanation: 'Both 1h and 4h trends are bullish, both lower timeframes show extreme bearish indicator consensus, and the closed 1m candle swept and reclaimed support with a long lower wick and a volume spike.',
      detailedAnalysis: [
        `Macro trend: 1h ${oneHourTrend}, 4h ${fourHourTrend}.`,
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
    return {
      ...base,
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
      `Macro trend: 1h ${oneHourTrend}, 4h ${fourHourTrend}.`,
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
  let oneHourTimer = null;
  let fourHourTimer = null;
  let refreshInProgress = false;

  const publishUpdate = (entry) => {
    entry.analysis = entry.ticker ? makeAnalysis(entry.ticker, entry.candles) : null;
    entry.lastUpdated = Date.now();
    entry.error = null;
    lastUpdated = entry.lastUpdated;
    lastError = null;
    if (entry.analysis) notifySignal(entry.analysis);
    onStatus();
  };

  const fetchKlines = async (symbol, timeframe, generation = watchlistGeneration) => {
    const path = `/klines?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&limit=100`;
    const rows = await fetchBinance(path);
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

  const bootstrap = async () => {
    const generation = watchlistGeneration;
    const symbolsToBootstrap = [...trackedSymbols];
    for (const symbol of symbolsToBootstrap) {
      if (stopped || generation !== watchlistGeneration) return;
      for (const timeframe of TIMEFRAMES) {
        if (stopped || generation !== watchlistGeneration) return;
        try {
          await fetchKlines(symbol, timeframe, generation);
        } catch (error) {
          if (generation !== watchlistGeneration) return;
          const entry = market.get(symbol);
          if (!entry) return;
          entry.error = error.message;
          lastError = error.message;
          console.error(`Market bootstrap failed for ${symbol} ${timeframe}:`, error.message);
        }
        await delay(150);
      }
      if (stopped || generation !== watchlistGeneration) return;
      try {
        const data = await fetchBinance(`/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
        if (stopped || generation !== watchlistGeneration) return;
        const entry = market.get(symbol);
        if (!entry) return;
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
        publishUpdate(entry);
      } catch (error) {
        if (generation !== watchlistGeneration) return;
        const entry = market.get(symbol);
        if (!entry) return;
        entry.error = error.message;
        lastError = error.message;
        console.error(`Ticker bootstrap failed for ${symbol}:`, error.message);
      }
      await delay(150);
    }
    if (generation === watchlistGeneration) onStatus();
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
      socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      const currentSocket = socket;
      currentSocket.on('open', () => {
        if (socket !== currentSocket) return;
        streamConnected = true;
        reconnectAttempt = 0;
        lastError = null;
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
    oneHourTimer = setInterval(() => void refreshTimeframe('1h'), 60 * 60 * 1000);
    fourHourTimer = setInterval(() => void refreshTimeframe('4h'), 4 * 60 * 60 * 1000);
  }

  function stop() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (oneHourTimer) clearInterval(oneHourTimer);
    if (fourHourTimer) clearInterval(fourHourTimer);
    reconnectTimer = null;
    oneHourTimer = null;
    fourHourTimer = null;
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
