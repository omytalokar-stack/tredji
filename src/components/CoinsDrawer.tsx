/**
 * Coins Drawer / Bottom Sheet
 * Triggered by the Bottom Bar "Coins" button.
 * Reveals the real-time analysis status of the remaining selected coins (and all 5 tracked coins).
 */
import React from 'react';
import { X, ArrowUpRight, ArrowDownRight, Target, ShieldAlert, AlertOctagon, Zap } from 'lucide-react';
import { TrapAnalysis } from '../types/crypto';

interface CoinsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analyses: Record<string, TrapAnalysis>;
  selectedCoins: string[];
  activeSymbol: string;
  onSelectCoin: (symbol: string) => void;
}

export const CoinsDrawer: React.FC<CoinsDrawerProps> = ({
  isOpen,
  onClose,
  analyses,
  selectedCoins,
  activeSymbol,
  onSelectCoin,
}) => {
  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  if (!isOpen) {
    return (
      <section className="hidden lg:grid grid-cols-2 xl:grid-cols-4 gap-4 transition-all duration-300">
        {selectedCoins.map((sym) => {
          const data = analyses[sym];
          const isCurrentlyActive = sym === activeSymbol;

          return (
            <button
              key={sym}
              type="button"
              onClick={() => onSelectCoin(sym)}
              className={`min-w-0 text-left p-4 rounded-2xl border bg-slate-900/80 hover:bg-slate-900 transition-all duration-300 ${
                isCurrentlyActive
                  ? 'border-rose-500/70 ring-1 ring-rose-500/30'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-100 truncate">
                    {data?.baseAsset ?? sym.replace('USDT', '')}
                    <span className="ml-1 text-[11px] font-mono font-normal text-slate-400">/USDT</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 truncate">
                    {data?.headline ?? 'Gathering Data...'}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-mono text-amber-300">
                  {data ? data.severity : 'GATHERING'}
                </span>
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-2">
                <span className="font-mono text-lg font-bold tabular-nums text-slate-100">
                  {data ? `$${formatPrice(data.currentPrice)}` : '—'}
                </span>
                {data && (
                  <span className={`text-xs font-mono font-semibold tabular-nums ${
                    data.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {data.priceChangePercent >= 0 ? '+' : ''}
                    {data.priceChangePercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in lg:hidden">
      <div
        className="w-full sm:max-w-2xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[92dvh] flex flex-col transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab Handle for Mobile */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-700/80 rounded-full mx-auto mb-4" />

        {/* Sheet Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight">
              Selected Coins · Real-Time Status
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live streaming analysis for your {selectedCoins.length} tracked Binance markets
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close coins sheet"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable list of coin statuses */}
        <div className="overflow-y-auto flex-1 min-h-0 py-4 space-y-3">
          {selectedCoins.map((sym) => {
            const data = analyses[sym];
            const isCurrentlyActive = sym === activeSymbol;

            if (!data) {
              return (
                <div key={sym} className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                  {sym}: Gathering Data...
                </div>
              );
            }

            const isBheed = data.signalType === 'RETAIL_TRAP_BHEED';
            const isHunt = data.signalType === 'STOP_LOSS_HUNT_ENTRY';
            const isFake = data.signalType === 'FAKE_BREAKOUT';
            const isPositive = data.priceChangePercent >= 0;

            let cardBorder = 'border-slate-800 hover:border-slate-700';
            let iconBadge = <Zap className="w-4 h-4 text-slate-400" />;

            if (isBheed) {
              cardBorder = 'border-rose-900/80 bg-rose-950/20';
              iconBadge = <ShieldAlert className="w-4 h-4 text-rose-400" />;
            } else if (isHunt) {
              cardBorder = 'border-emerald-900/80 bg-emerald-950/20';
              iconBadge = <Target className="w-4 h-4 text-emerald-400" />;
            } else if (isFake) {
              cardBorder = 'border-amber-900/80 bg-amber-950/20';
              iconBadge = <AlertOctagon className="w-4 h-4 text-amber-400" />;
            }

            return (
              <div
                key={sym}
                onClick={() => {
                  onSelectCoin(sym);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer bg-slate-950/70 hover:bg-slate-850/80 flex flex-col gap-3 ${cardBorder} ${
                  isCurrentlyActive ? 'ring-2 ring-rose-500/40' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-slate-200">
                      {data.baseAsset.slice(0, 3)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">{data.baseAsset}</span>
                        <span className="text-[11px] font-mono text-slate-400">/USDT</span>
                        {isCurrentlyActive && (
                          <span className="text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.2 rounded">
                            Main View
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                        <span>Vol Ratio: {data.volumeRatio.toFixed(2)}x</span>
                        <span>·</span>
                        <span>{data.severity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Price & 24h Change */}
                  <div className="text-right">
                    <div className="font-mono font-bold text-sm text-slate-100 tabular-nums">
                      ${formatPrice(data.currentPrice)}
                    </div>
                    <div
                      className={`text-xs font-mono font-semibold flex items-center justify-end gap-0.5 tabular-nums ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isPositive ? '+' : ''}
                        {data.priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Alert Row */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-850/60 text-xs">
                  <div className="flex items-center gap-2">
                    {iconBadge}
                    <span className="font-medium text-slate-200">{data.headline}</span>
                  </div>
                  <button className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 underline underline-offset-2">
                    Inspect ›
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Click any coin to view in Home Radar</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
