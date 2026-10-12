/**
 * Home Page Main View: Displays the #1 active trade or "Trap Alert" detected by the AI
 * Text and alert-driven, beginner-friendly, zero complex candlestick charts.
 */
import React from 'react';
import {
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  Zap,
  Target,
  BarChart2,
  Activity,
  Gauge,
  Info,
} from 'lucide-react';
import { TrapAnalysis } from '../types/crypto';

interface MainTrapCardProps {
  analysis: TrapAnalysis | undefined;
  allAnalyses: Record<string, TrapAnalysis>;
  selectedCoins: string[];
  activeSymbol: string;
  onSelectCoin: (symbol: string) => void;
  priceFlash: 'up' | 'down' | null;
  isTopRanked?: boolean;
  onBookTrade?: (analysis: TrapAnalysis) => void;
}

export const MainTrapCard: React.FC<MainTrapCardProps> = ({
  analysis,
  allAnalyses,
  selectedCoins,
  activeSymbol,
  onSelectCoin,
  priceFlash,
  onBookTrade,
}) => {
  if (!analysis) {
    return (
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center text-slate-400 md:col-span-2">
        Gathering 100-Candle MTF Data... Signals stay blocked until all four Binance timeframes are ready.
      </div>
    );
  }

  // Visual theming based on signal type
  const isBheedTrap = analysis.signalType === 'RETAIL_TRAP_BHEED';
  const isStopLossHunt = analysis.signalType === 'STOP_LOSS_HUNT_ENTRY';
  const isFakeBreakout = analysis.signalType === 'FAKE_BREAKOUT';

  // Card banner theme
  let bannerBg = 'bg-slate-900 border-slate-800 text-slate-300';
  let bannerIcon = <Zap className="w-5 h-5 text-slate-400" />;
  let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';

  if (isBheedTrap) {
    bannerBg = 'bg-rose-950/70 border-rose-800/80 text-rose-200 shadow-rose-950/50';
    bannerIcon = <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />;
    badgeStyle = 'bg-rose-900/80 text-rose-200 border-rose-700/80';
  } else if (isStopLossHunt) {
    bannerBg = 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200 shadow-emerald-950/50';
    bannerIcon = <Target className="w-6 h-6 text-emerald-400 shrink-0" />;
    badgeStyle = 'bg-emerald-900/80 text-emerald-200 border-emerald-700/80';
  } else if (isFakeBreakout) {
    bannerBg = 'bg-amber-950/70 border-amber-800/80 text-amber-200 shadow-amber-950/50';
    bannerIcon = <AlertOctagon className="w-6 h-6 text-amber-400 shrink-0" />;
    badgeStyle = 'bg-amber-900/80 text-amber-200 border-amber-700/80';
  }

  // Format price neatly based on magnitude
  const formatPrice = (val: number) => {
    if (val >= 1000) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    }
    if (val >= 1) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 });
    }
    return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  const isPricePositive = analysis.priceChangePercent >= 0;

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 transition-all duration-300">
      {/* Coin Selector Switcher (Shows all 5 selected coins, highlighting active & #1 Alert) */}
      <div className="w-full overflow-x-auto pb-1 scrollbar-none flex items-center gap-2 md:col-span-2">
        {selectedCoins.map((sym) => {
          const coinData = allAnalyses[sym];
          const isSelected = sym === activeSymbol;
          const isCoinBheed = coinData?.signalType === 'RETAIL_TRAP_BHEED';
          const isCoinHunt = coinData?.signalType === 'STOP_LOSS_HUNT_ENTRY';
          const isCoinFake = coinData?.signalType === 'FAKE_BREAKOUT';

          return (
            <button
              key={sym}
              onClick={() => onSelectCoin(sym)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-2 border ${
                isSelected
                  ? 'bg-slate-100 text-slate-950 border-slate-100 shadow-md font-bold'
                  : 'bg-slate-900/80 hover:bg-slate-850 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>{sym.replace('USDT', '')}</span>
              {coinData && (
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    isSelected
                      ? 'text-slate-800'
                      : coinData.priceChangePercent >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {coinData.priceChangePercent >= 0 ? '+' : ''}
                  {coinData.priceChangePercent.toFixed(1)}%
                </span>
              )}
              {/* Alert indicator dot */}
              {isCoinHunt ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" title="Smart Entry Active" />
              ) : isCoinBheed ? (
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500" title="Retail Trap Active" />
              ) : isCoinFake ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400" title="Fake Breakout" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Main Alert Card */}
      <div className="w-full bg-slate-900 border border-slate-800/90 rounded-3xl p-4 sm:p-7 md:p-8 shadow-xl relative overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-x-6 transition-all duration-300 md:col-span-2">
        {/* Subtle decorative glow based on severity */}
        {isBheedTrap && (
          <div className="absolute top-0 right-0 w-72 h-72 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        )}
        {isStopLossHunt && (
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
        )}
        {isFakeBreakout && (
          <div className="absolute top-0 right-0 w-72 h-72 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
        )}

        {/* 1. PRIMARY ALERT BANNER */}
        <div
          className={`order-2 md:order-2 md:col-start-2 md:row-start-1 w-full rounded-2xl border p-4 sm:p-5 mb-1 md:mb-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-lg transition-all duration-300 ${bannerBg}`}
        >
          <div className="flex items-start gap-3 min-w-0">
            {bannerIcon}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[11px] font-bold tracking-wider uppercase font-mono px-2 py-0.5 rounded-md border ${badgeStyle}`}
                >
                  {analysis.badgeText}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {analysis.baseAsset}/USDT · 1m/5m Indicators + 1h/4h Macro
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight mt-1 text-slate-100">
                {analysis.headline}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
                {analysis.taglineHindi}
              </p>
            </div>
          </div>

          {/* Qualitative rule severity; no numeric confidence score is generated. */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">
              Rule Severity
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-bold font-mono text-slate-100">
                {analysis.severity}
              </span>
            </div>
            {typeof analysis.suggestedSL === 'number' &&
              typeof analysis.suggestedTarget === 'number' && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-right font-mono">
                  <span className="text-[10px] uppercase text-rose-300">Stop-Loss</span>
                  <span className="text-[10px] uppercase text-emerald-300">Target · 1:2</span>
                  <span className="text-xs font-bold tabular-nums text-rose-200">
                    ${formatPrice(analysis.suggestedSL)}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-emerald-200">
                    ${formatPrice(analysis.suggestedTarget)}
                  </span>
                </div>
              )}
          </div>
        </div>

        {/* 2. REAL LIVE PRICE & 24H TICKER */}
        <div className="order-1 md:order-1 md:col-start-1 md:row-start-1 flex flex-col justify-center gap-4 pb-5 md:pb-0">
          <div>
            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <span>Binance Live Price</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className={`text-3xl sm:text-5xl font-black font-mono tracking-tight tabular-nums transition-colors duration-300 ${
                  priceFlash === 'up'
                    ? 'text-emerald-400 bg-emerald-950/60 px-2 rounded-lg'
                    : priceFlash === 'down'
                    ? 'text-rose-400 bg-rose-950/60 px-2 rounded-lg'
                    : 'text-slate-100'
                }`}
              >
                ${formatPrice(analysis.currentPrice)}
              </div>

              <div
                className={`flex items-center gap-1 font-mono text-sm sm:text-base font-bold tabular-nums px-2.5 py-1 rounded-lg ${
                  isPricePositive
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                }`}
              >
                {isPricePositive ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                <span>
                  {isPricePositive ? '+' : ''}
                  {analysis.priceChangePercent.toFixed(2)}% (24h)
                </span>
              </div>
            </div>
          </div>

          {/* 24h High and Low ranges */}
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">24h Low</span>
              <span className="text-slate-300 font-medium tabular-nums">
                ${formatPrice(analysis.low24h)}
              </span>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">24h High</span>
              <span className="text-slate-300 font-medium tabular-nums">
                ${formatPrice(analysis.high24h)}
              </span>
            </div>
          </div>
        </div>

        {/* MTF context and indicator agreement */}
        <div className="order-3 md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-4 ${
            analysis.macroTrend === 'BULLISH'
              ? 'bg-emerald-950/40 border-emerald-800/70'
              : analysis.macroTrend === 'BEARISH'
                ? 'bg-rose-950/40 border-rose-800/70'
                : 'bg-slate-950/80 border-slate-800'
          }`}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Higher-Timeframe Macro Trend</div>
            <div className="mt-1 text-lg font-bold text-slate-100">HTF Trend: {analysis.macroTrend}</div>
            <div className="text-xs text-slate-300 mt-1">1h: {analysis.oneHourTrend} · 4h: {analysis.fourHourTrend} · EMA-50</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">Retail Consensus · 10 Indicators</div>
            {(['1m', '5m'] as const).map((timeframe) => {
              const buyCount = analysis.indicatorVotes.filter((item) => item[timeframe === '1m' ? 'oneMinute' : 'fiveMinute'] === 'BUY').length;
              const sellCount = analysis.indicatorVotes.filter((item) => item[timeframe === '1m' ? 'oneMinute' : 'fiveMinute'] === 'SELL').length;
              return (
                <div key={timeframe} className="flex items-center justify-between gap-2 mt-2 text-xs">
                  <span className="text-slate-300">{timeframe} chart</span>
                  <span className="font-mono">
                    <span className="text-emerald-300">{buyCount}/10 BUY</span>
                    <span className="text-slate-500"> · </span>
                    <span className="text-rose-300">{sellCount}/10 SELL</span>
                  </span>
                </div>
              );
            })}
            <div className="mt-2 text-xs font-bold text-slate-100">Retail Sentiment: {analysis.retailSentiment}</div>
          </div>
        </div>

        {/* 3. DIRECT ACTION ADVICE (WHAT THE BEGINNER MUST DO) */}
        <div className="order-4 md:col-span-2 my-1 md:my-0 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-start gap-3.5 transition-all duration-300">
          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0 text-slate-300">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Direct Action Advice
            </span>
            <p className="text-sm sm:text-base font-bold text-slate-100 mt-0.5 leading-snug">
              {analysis.actionAdvice}
            </p>
            {(isBheedTrap || isStopLossHunt) && onBookTrade && (
              <button
                type="button"
                onClick={() => onBookTrade(analysis)}
                className="mt-3 min-h-11 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                Book Trade
              </button>
            )}
          </div>
        </div>

        {/* 4. BEGINNER-FRIENDLY EXPLANATION (NO COMPLICATED JARGON) */}
        <div className="order-5 md:col-span-2 space-y-3 mb-2 md:mb-1">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-rose-400" />
            <span>What Is Happening Right Now?</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed bg-slate-850/60 p-4 sm:p-5 rounded-2xl border border-slate-800/80">
            {analysis.beginnerExplanation}
          </p>
        </div>

        {/* 5. Measured candle volume, wick, and prior range */}
        <div className="order-6 md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 mb-1">
          {/* Metric 1: Volume vs 20-MA */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <BarChart2 className="w-3.5 h-3.5 text-slate-400" />
                Volume vs 20-MA
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span
                className={`text-xl font-bold font-mono tabular-nums ${
                  analysis.volumeRatio < 1
                    ? 'text-amber-400'
                    : analysis.volumeRatio > 1
                    ? 'text-emerald-400'
                    : 'text-slate-200'
                }`}
              >
                {analysis.volumeRatio.toFixed(2)}x
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {analysis.volumeRatio < 1
                  ? '(Below average)'
                  : analysis.volumeRatio > 1
                    ? '(Above average)'
                    : '(At average)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
              Avg: {analysis.avgVolume20.toFixed(2)} · Closed candle: {analysis.currentVolume.toFixed(2)}
            </p>
          </div>

          {/* Metric 2: Measured lower-wick share */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                Lower Wick
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold font-mono text-slate-200">
                {(analysis.lowerWickRatio * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
              Share of analyzed candle range
            </p>
          </div>

          {/* Metric 3: Measured prior-candle support/resistance */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                Prior 15-Candle Range
              </span>
            </div>
            <div className="flex flex-col gap-1 mt-1 text-xs font-mono">
              <span className="text-emerald-300">Low: {formatPrice(analysis.recentSupport)}</span>
              <span className="text-rose-300">High: {formatPrice(analysis.recentResistance)}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
              Completed candles before signal candle
            </p>
          </div>
        </div>

        {/* 6. Rule checks based on measured candles */}
        <div className="order-7 md:col-span-2 pt-4 border-t border-slate-800/70">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Rule Checks · Closed Binance Candles
          </div>
          <ul className="space-y-1.5">
            {analysis.detailedAnalysis.map((item, idx) => (
              <li
                key={idx}
                className="text-xs text-slate-300 font-mono flex items-start gap-2 bg-slate-950/40 p-2 rounded-lg border border-slate-850"
              >
                <span className="text-rose-400 font-bold shrink-0">›</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
