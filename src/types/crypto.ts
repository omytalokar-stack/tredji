/**
 * Types for TrapDetector AI
 * Connects directly to Binance Live Data
 */

export type TrapSignalType =
  | 'RETAIL_TRAP_BHEED'
  | 'STOP_LOSS_HUNT_ENTRY'
  | 'FAKE_BREAKOUT'
  | 'NEUTRAL_SCANNING';

export type SignalSeverity = 'CRITICAL' | 'OPPORTUNITY' | 'WARNING' | 'NEUTRAL';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  closeTime: number;
  takerBuyVolume: number;
  isClosed: boolean;
}

export type Timeframe = '1m' | '5m' | '1h' | '4h';
export type IndicatorDirection = 'BUY' | 'SELL' | 'NEUTRAL';
export type MacroTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type RetailSentiment = 'EXTREME BULLISH' | 'EXTREME BEARISH' | 'MIXED';

export interface IndicatorVote {
  name: string;
  oneMinute: IndicatorDirection;
  fiveMinute: IndicatorDirection;
  direction: IndicatorDirection;
}

export type MultiTimeframeCandles = Record<Timeframe, Candle[]>;

export interface LiveCoinTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  quoteVolume24h: number;
  lastUpdated: number;
}

export interface TrapAnalysis {
  symbol: string;
  baseAsset: string;
  currentPrice: number;
  priceChangePercent: number;
  high24h: number;
  low24h: number;
  currentVolume: number;
  avgVolume20: number;
  volumeRatio: number; // current candle volume / avgVolume20
  lowerWickRatio: number;
  recentSupport: number;
  recentResistance: number;
  macroTrend: MacroTrend;
  oneHourTrend: MacroTrend;
  fourHourTrend: MacroTrend;
  retailSentiment: RetailSentiment;
  retailBuyCount: number;
  retailSellCount: number;
  indicatorVotes: IndicatorVote[];
  signalType: TrapSignalType;
  severity: SignalSeverity;
  suggestedSL?: number;
  suggestedTarget?: number;
  badgeText: string;
  headline: string;
  taglineHindi: string;
  actionAdvice: string;
  actionType: 'AVOID' | 'ENTRY' | 'WATCH';
  beginnerExplanation: string;
  detailedAnalysis: string[];
  timestamp: number;
}

export interface BinanceSearchResult {
  symbol: string;
  baseAsset: string;
  price: number;
  priceChangePercent: number;
  quoteVolume: number;
}
