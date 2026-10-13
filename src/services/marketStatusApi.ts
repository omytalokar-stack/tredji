import { backendApiUrl } from './backendApi';
import {
  Candle,
  IndicatorDirection,
  LiveCoinTicker,
  MultiTimeframeCandles,
  TrapAnalysis,
} from '../types/crypto';

export interface MarketStatusSymbol {
  symbol: string;
  ticker: LiveCoinTicker | null;
  candles: MultiTimeframeCandles;
  analysis: TrapAnalysis | null;
  lastUpdated: number | null;
  error: string | null;
}

export interface MarketStatusSnapshot {
  status: 'live' | 'partial' | 'warming_up';
  symbols: MarketStatusSymbol[];
  startedAt: number;
  updatedAt: number | null;
  streamConnected: boolean;
  lastMessageAt: number | null;
  readySymbols: number;
  lastError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCandle(value: unknown): value is Candle {
  return isRecord(value) &&
    ['openTime', 'open', 'high', 'low', 'close', 'volume', 'closeTime', 'quoteVolume', 'takerBuyVolume']
      .every((field) => typeof value[field] === 'number' && Number.isFinite(value[field])) &&
    typeof value.isClosed === 'boolean';
}

function isCandles(value: unknown): value is MultiTimeframeCandles {
  return isRecord(value) &&
    ['1m', '5m', '15m'].every((timeframe) =>
      Array.isArray(value[timeframe]) && value[timeframe].every(isCandle)
    );
}

function isTicker(value: unknown): value is LiveCoinTicker {
  return isRecord(value) &&
    typeof value.symbol === 'string' &&
    typeof value.baseAsset === 'string' &&
    typeof value.quoteAsset === 'string' &&
    ['price', 'priceChangePercent', 'high24h', 'low24h', 'volume24h', 'quoteVolume24h', 'lastUpdated']
      .every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]));
}

function isDirection(value: unknown): value is IndicatorDirection {
  return value === 'BUY' || value === 'SELL' || value === 'NEUTRAL';
}

function isAnalysis(value: unknown): value is TrapAnalysis {
  const signalTypes = ['RETAIL_TRAP_BHEED', 'STOP_LOSS_HUNT_ENTRY', 'FAKE_BREAKOUT', 'SCALP_OPPORTUNITY', 'NEUTRAL_SCANNING'];
  const trends = ['BULLISH', 'BEARISH', 'NEUTRAL'];
  const sentiments = ['EXTREME BULLISH', 'EXTREME BEARISH', 'MIXED'];
  return isRecord(value) &&
    typeof value.symbol === 'string' &&
    typeof value.baseAsset === 'string' &&
    ['currentPrice', 'priceChangePercent', 'high24h', 'low24h', 'currentVolume', 'avgVolume20', 'volumeRatio', 'lowerWickRatio', 'recentSupport', 'recentResistance', 'retailBuyCount', 'retailSellCount', 'timestamp']
      .every((field) => typeof value[field] === 'number' && Number.isFinite(value[field])) &&
    ['suggestedSL', 'suggestedTarget'].every((field) =>
      value[field] === undefined || (typeof value[field] === 'number' && Number.isFinite(value[field]))
    ) &&
    (value.signalType !== 'RETAIL_TRAP_BHEED' && value.signalType !== 'STOP_LOSS_HUNT_ENTRY' ||
      (typeof value.suggestedSL === 'number' && Number.isFinite(value.suggestedSL) &&
        typeof value.suggestedTarget === 'number' && Number.isFinite(value.suggestedTarget))) &&
    trends.includes(String(value.macroTrend)) &&
    trends.includes(String(value.oneHourTrend)) &&
    trends.includes(String(value.fourHourTrend)) &&
    sentiments.includes(String(value.retailSentiment)) &&
    signalTypes.includes(String(value.signalType)) &&
    Array.isArray(value.indicatorVotes) &&
    value.indicatorVotes.every((vote) =>
      isRecord(vote) &&
      typeof vote.name === 'string' &&
      isDirection(vote.oneMinute) &&
      isDirection(vote.fiveMinute) &&
      isDirection(vote.direction)
    ) &&
    Array.isArray(value.detailedAnalysis) &&
    value.detailedAnalysis.every((item) => typeof item === 'string') &&
    ['severity', 'badgeText', 'headline', 'taglineHindi', 'actionAdvice', 'actionType', 'beginnerExplanation']
      .every((field) => typeof value[field] === 'string');
}

function isStatusSymbol(value: unknown): value is MarketStatusSymbol {
  return isRecord(value) &&
    typeof value.symbol === 'string' &&
    isCandles(value.candles) &&
    (value.ticker === null || isTicker(value.ticker)) &&
    (value.analysis === null || isAnalysis(value.analysis)) &&
    (value.lastUpdated === null || typeof value.lastUpdated === 'number') &&
    (value.error === null || typeof value.error === 'string');
}

function isMarketStatusSnapshot(value: unknown): value is MarketStatusSnapshot {
  return isRecord(value) &&
    (value.status === 'live' || value.status === 'partial' || value.status === 'warming_up') &&
    Array.isArray(value.symbols) &&
    value.symbols.every(isStatusSymbol) &&
    typeof value.startedAt === 'number' &&
    (value.updatedAt === null || typeof value.updatedAt === 'number') &&
    typeof value.streamConnected === 'boolean' &&
    (value.lastMessageAt === null || typeof value.lastMessageAt === 'number') &&
    typeof value.readySymbols === 'number' &&
    (value.lastError === null || typeof value.lastError === 'string');
}

export async function fetchMarketStatus(
  symbols: string[],
  signal?: AbortSignal
): Promise<MarketStatusSnapshot> {
  const query = new URLSearchParams({ symbols: symbols.join(',') });
  const response = await fetch(`${backendApiUrl('/api/market-status')}?${query}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Market status request failed with HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();
  if (!isMarketStatusSnapshot(data)) {
    throw new Error('Market status endpoint returned an invalid response.');
  }
  return data;
}
