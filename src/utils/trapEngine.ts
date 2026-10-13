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
import {
  Candle,
  IndicatorDirection,
  IndicatorVote,
  LiveCoinTicker,
  MacroTrend,
  MultiTimeframeCandles,
  RetailSentiment,
  TrapAnalysis,
} from '../types/crypto';

const REQUIRED_CANDLE_COUNT = 100;
const BASELINE_CANDLE_COUNT = 20;
const SUPPORT_CANDLE_COUNT = 15;
const MIN_CONSENSUS_VOTES = 7;

function calculateRiskLevels(
  candles: Candle[],
  entry: number,
  direction: 'LONG' | 'SHORT'
): Pick<TrapAnalysis, 'suggestedSL' | 'suggestedTarget'> | null {
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

function finiteValues(candles: Candle[]): boolean {
  return candles.every((candle) =>
    [
      candle.openTime,
      candle.closeTime,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ].every(Number.isFinite) &&
    candle.open > 0 &&
    candle.high >= candle.low &&
    candle.volume >= 0
  );
}

function getMacroTrend(candles: Candle[]): MacroTrend {
  const closes = candles.filter((candle) => candle.isClosed).map((candle) => candle.close);
  if (closes.length < 50) return 'NEUTRAL';
  const ema50 = EMA.calculate({ period: 50, values: closes }).at(-1);
  const price = closes.at(-1);
  if (ema50 === undefined || price === undefined) return 'NEUTRAL';
  return price > ema50 ? 'BULLISH' : price < ema50 ? 'BEARISH' : 'NEUTRAL';
}

function latest<T>(values: T[]): T | undefined {
  return values.at(-1);
}

function evaluateIndicators(candles: Candle[]): IndicatorDirection[] | null {
  const closed = candles.filter((candle) => candle.isClosed);
  if (closed.length < 50 || !finiteValues(closed)) return null;

  const close = closed.map((candle) => candle.close);
  const high = closed.map((candle) => candle.high);
  const low = closed.map((candle) => candle.low);
  const directions: IndicatorDirection[] = [];

  const rsi = latest(RSI.calculate({ period: 14, values: close }));
  if (rsi === undefined) return null;
  directions.push(
    rsi < 30 || (rsi >= 50 && rsi <= 70)
      ? 'BUY'
      : rsi > 70 || rsi < 50
        ? 'SELL'
        : 'NEUTRAL'
  );

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
  if (ema20 === undefined || ema50 === undefined || sma50 === undefined || currentClose === undefined) {
    return null;
  }
  directions.push(currentClose > ema20 ? 'BUY' : currentClose < ema20 ? 'SELL' : 'NEUTRAL');
  directions.push(currentClose > ema50 ? 'BUY' : currentClose < ema50 ? 'SELL' : 'NEUTRAL');
  directions.push(currentClose > sma50 ? 'BUY' : currentClose < sma50 ? 'SELL' : 'NEUTRAL');

  const stochastic = latest(Stochastic.calculate({
    high,
    low,
    close,
    period: 14,
    signalPeriod: 3,
  }));
  if (!stochastic) return null;
  directions.push(
    stochastic.k > stochastic.d
      ? 'BUY'
      : stochastic.k < stochastic.d
        ? 'SELL'
        : 'NEUTRAL'
  );

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

function countDirection(directions: IndicatorDirection[], direction: IndicatorDirection): number {
  return directions.filter((item) => item === direction).length;
}

function getCombinedSentiment(
  oneMinuteDirections: IndicatorDirection[],
  fiveMinuteDirections: IndicatorDirection[]
): { sentiment: RetailSentiment; buyCount: number; sellCount: number } {
  const oneMinuteBuy = countDirection(oneMinuteDirections, 'BUY');
  const fiveMinuteBuy = countDirection(fiveMinuteDirections, 'BUY');
  const oneMinuteSell = countDirection(oneMinuteDirections, 'SELL');
  const fiveMinuteSell = countDirection(fiveMinuteDirections, 'SELL');

  if (oneMinuteBuy >= MIN_CONSENSUS_VOTES && fiveMinuteBuy >= MIN_CONSENSUS_VOTES) {
    return { sentiment: 'EXTREME BULLISH', buyCount: Math.min(oneMinuteBuy, fiveMinuteBuy), sellCount: Math.max(oneMinuteSell, fiveMinuteSell) };
  }
  if (oneMinuteSell >= MIN_CONSENSUS_VOTES && fiveMinuteSell >= MIN_CONSENSUS_VOTES) {
    return { sentiment: 'EXTREME BEARISH', buyCount: Math.max(oneMinuteBuy, fiveMinuteBuy), sellCount: Math.min(oneMinuteSell, fiveMinuteSell) };
  }
  return {
    sentiment: 'MIXED',
    buyCount: Math.min(oneMinuteBuy, fiveMinuteBuy),
    sellCount: Math.min(oneMinuteSell, fiveMinuteSell),
  };
}

function getStrongBullishConsensus(oneMinuteDirections: IndicatorDirection[], fiveMinuteDirections: IndicatorDirection[]): boolean {
  return countDirection(oneMinuteDirections, 'BUY') >= MIN_CONSENSUS_VOTES &&
    countDirection(fiveMinuteDirections, 'BUY') >= MIN_CONSENSUS_VOTES;
}

function getStrongBearishConsensus(oneMinuteDirections: IndicatorDirection[], fiveMinuteDirections: IndicatorDirection[]): boolean {
  return countDirection(oneMinuteDirections, 'SELL') >= MIN_CONSENSUS_VOTES &&
    countDirection(fiveMinuteDirections, 'SELL') >= MIN_CONSENSUS_VOTES;
}

function getBandState(candles: Candle[]): { upper: number; middle: number; lower: number; squeeze: boolean } | null {
  const closed = candles.filter((candle) => candle.isClosed);
  const closes = closed.map((candle) => candle.close);
  if (closes.length < 20) return null;

  const bands = latest(BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }));
  if (!bands) return null;

  const recent = closes.slice(-20);
  const recentHigh = Math.max(...recent);
  const recentLow = Math.min(...recent);
  const bandWidth = bands.upper - bands.lower;
  const squeeze = bandWidth < (recentHigh - recentLow) * 0.6;

  return { upper: bands.upper, middle: bands.middle, lower: bands.lower, squeeze };
}

export function analyzeMarketTrap(
  ticker: LiveCoinTicker,
  candles: MultiTimeframeCandles
): TrapAnalysis | null {
  if (
    (['1m', '5m', '15m'] as const).some(
      (timeframe) =>
        candles[timeframe].length < REQUIRED_CANDLE_COUNT ||
        !finiteValues(candles[timeframe])
    )
  ) {
    return null;
  }

  const oneMinuteDirections = evaluateIndicators(candles['1m']);
  const fiveMinuteDirections = evaluateIndicators(candles['5m']);
  if (!oneMinuteDirections || !fiveMinuteDirections) return null;

  const closedOneMinute = candles['1m']
    .filter((candle) => candle.isClosed)
    .sort((a, b) => a.openTime - b.openTime);
  const currentCandle = closedOneMinute.at(-1);
  const history = closedOneMinute.slice(-21, -1);
  if (!currentCandle || history.length !== BASELINE_CANDLE_COUNT) return null;

  const fifteenMinuteTrend = getMacroTrend(candles['15m']);
  const macroTrend: MacroTrend = fifteenMinuteTrend;
  const oneHourTrend = fifteenMinuteTrend;
  const fourHourTrend = fifteenMinuteTrend;

  const consensus = getCombinedSentiment(oneMinuteDirections, fiveMinuteDirections);
  const indicatorNames = [
    'RSI(14)', 'MACD(12,26,9)', 'EMA(20)', 'EMA(50)', 'SMA(50)',
    'Stochastic(14,3,3)', 'CCI(20)', 'ADX(14)', 'Williams %R(14)', 'Bollinger Bands',
  ];
  const indicatorVotes: IndicatorVote[] = indicatorNames.map((name, index) => ({
    name,
    oneMinute: oneMinuteDirections[index],
    fiveMinute: fiveMinuteDirections[index],
    direction:
      oneMinuteDirections[index] === fiveMinuteDirections[index]
        ? oneMinuteDirections[index]
        : 'NEUTRAL',
  }));

  const avgVolume20 = history.reduce((sum, candle) => sum + candle.volume, 0) / BASELINE_CANDLE_COUNT;
  if (avgVolume20 <= 0) return null;
  const currentVolume = currentCandle.volume;
  const volumeRatio = currentVolume / avgVolume20;
  const recentCandles = closedOneMinute.slice(-SUPPORT_CANDLE_COUNT - 1, -1);
  if (recentCandles.length !== SUPPORT_CANDLE_COUNT) return null;
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
  const isBearishLowVolumeBreakout =
    macroTrend === 'BEARISH' &&
    consensus.sentiment === 'EXTREME BULLISH' &&
    currentCandle.high > recentResistance &&
    volumeRatio < 1;

  const closedFiveMinute = candles['5m']
    .filter((candle) => candle.isClosed)
    .sort((a, b) => a.openTime - b.openTime);
  const currentFiveMinute = closedFiveMinute.at(-1);
  const fiveMinuteEMA50 = latest(EMA.calculate({
    period: 50,
    values: closedFiveMinute.map((candle) => candle.close),
  }));
  const fiveMinutePullbackTouch = currentFiveMinute && fiveMinuteEMA50 !== undefined &&
    currentFiveMinute.close >= fiveMinuteEMA50 * 0.995 &&
    currentFiveMinute.close <= fiveMinuteEMA50 * 1.005;
  const goldenPullback =
    fifteenMinuteTrend === 'BULLISH' &&
    fiveMinutePullbackTouch &&
    getStrongBullishConsensus(oneMinuteDirections, fiveMinuteDirections) &&
    volumeRatio > 1.5;

  const oneMinuteBandState = getBandState(candles['1m']);
  const fiveMinuteBandState = getBandState(candles['5m']);
  const breakoutBandState = oneMinuteBandState ?? fiveMinuteBandState;
  const bullishBreakout =
    breakoutBandState &&
    breakoutBandState.squeeze &&
    currentCandle.close > breakoutBandState.upper &&
    getStrongBullishConsensus(oneMinuteDirections, fiveMinuteDirections) &&
    volumeRatio > 1.5;
  const bearishBreakout =
    breakoutBandState &&
    breakoutBandState.squeeze &&
    currentCandle.close < breakoutBandState.lower &&
    getStrongBearishConsensus(oneMinuteDirections, fiveMinuteDirections) &&
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
    macroTrend,
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
        `1m/5m bullish consensus: ${countDirection(oneMinuteDirections, 'BUY')}/10 and ${countDirection(fiveMinuteDirections, 'BUY')}/10 BUY.`,
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
          ? `Bullish breakout above the squeeze zone: ${breakoutBandState?.upper.toLocaleString()}.`
          : `Bearish breakdown below the squeeze zone: ${breakoutBandState?.lower.toLocaleString()}.`,
        `1m/5m strict consensus check passed: ${bullishBreakout ? 'BUY' : 'SELL'} across 7/10 indicator votes.`,
        `Current 1m volume is ${volumeRatio.toFixed(2)}x the prior 20-candle average.`,
      ],
    };
  }

  const supportSweep = currentCandle.low < recentSupport && currentCandle.close > recentSupport;
  if (
    macroTrend === 'BULLISH' &&
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
      beginnerExplanation: 'The 15m trend is bullish, both lower timeframes show extreme bearish consensus, and the closed 1m candle swept and reclaimed support with a long lower wick and a volume spike.',
      detailedAnalysis: [
        `Macro trend: 15m ${oneHourTrend}.`,
        `Retail consensus: ${consensus.sellCount}/10 SELL on both 1m and 5m.`,
        `Support ${recentSupport.toLocaleString()}, wick ${(lowerWickRatio * 100).toFixed(1)}%, volume ${volumeRatio.toFixed(2)}x average.`,
      ],
    };
  }

  if (isBearishLowVolumeBreakout) {
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
      `Consensus: 1m ${countDirection(oneMinuteDirections, 'BUY')}/10 BUY, ${countDirection(oneMinuteDirections, 'SELL')}/10 SELL; 5m ${countDirection(fiveMinuteDirections, 'BUY')}/10 BUY, ${countDirection(fiveMinuteDirections, 'SELL')}/10 SELL.`,
      `1m signal volume: ${currentVolume.toLocaleString()} vs prior 20-candle average ${avgVolume20.toLocaleString()} (${volumeRatio.toFixed(2)}x).`,
    ],
  };
}
