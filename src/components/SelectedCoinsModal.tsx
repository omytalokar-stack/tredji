/**
 * Selected Coins Manager Modal
 * Triggered by clicking the Cute Mascot Logo on top-left.
 * Enforces the strict maximum limit of 5 coins.
 */
import React from 'react';
import { X, Trash2, Plus, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { LiveCoinTicker, TrapAnalysis } from '../types/crypto';

interface SelectedCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCoins: string[];
  maxCoins: number;
  tickers: Record<string, LiveCoinTicker>;
  analyses: Record<string, TrapAnalysis>;
  onRemoveCoin: (symbol: string) => { success: boolean; message: string };
  onOpenSearch: () => void;
  onSelectActiveCoin: (symbol: string) => void;
}

export const SelectedCoinsModal: React.FC<SelectedCoinsModalProps> = ({
  isOpen,
  onClose,
  selectedCoins,
  maxCoins,
  tickers,
  analyses,
  onRemoveCoin,
  onOpenSearch,
  onSelectActiveCoin,
}) => {
  if (!isOpen) return null;

  const isAtLimit = selectedCoins.length >= maxCoins;

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl flex flex-col h-[90dvh] sm:h-auto max-h-[90dvh] transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                Selected Coins
              </h2>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
                  isAtLimit
                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                }`}
              >
                {selectedCoins.length} / {maxCoins} Max
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Tracking limit capped at {maxCoins} coins to maintain real-time Binance WebSocket performance.
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info notice about 5 coins limit */}
        {isAtLimit && (
          <div className="my-3 p-3 rounded-xl bg-rose-950/30 border border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              Maximum 5 coins tracked. To track a different ticker from Binance, remove one coin first or replace it in search.
            </span>
          </div>
        )}

        {/* Coins List */}
        <div className="overflow-y-auto flex-1 min-h-0 py-3 space-y-2.5">
          {selectedCoins.map((sym) => {
            const ticker = tickers[sym];
            const analysis = analyses[sym];
            const base = sym.replace('USDT', '');
            const isPositive = (ticker?.priceChangePercent ?? 0) >= 0;

            return (
              <div
                key={sym}
                className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800/90 flex items-center justify-between gap-2 sm:gap-3 hover:border-slate-750 transition-colors duration-300"
              >
                <div
                  className="flex items-center gap-3 cursor-pointer min-w-0"
                  onClick={() => {
                    onSelectActiveCoin(sym);
                    onClose();
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-slate-200 shrink-0">
                    {base.slice(0, 3)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slate-100">{base}</span>
                      <span className="text-xs font-mono text-slate-400">/USDT</span>
                    </div>
                    {analysis && (
                      <span className="text-[11px] text-slate-400 block truncate">
                        {analysis.badgeText} · {analysis.headline}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: Price + Delete Button */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {ticker && (
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-100 tabular-nums">
                        ${formatPrice(ticker.price)}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-semibold flex items-center justify-end tabular-nums ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{ticker.priceChangePercent.toFixed(2)}%</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const res = onRemoveCoin(sym);
                      if (!res.success) {
                        alert(res.message);
                      }
                    }}
                    disabled={selectedCoins.length <= 1}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                      selectedCoins.length <= 1
                        ? 'opacity-40 cursor-not-allowed text-slate-600 bg-slate-900'
                        : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 bg-slate-900 border border-slate-800'
                    }`}
                    title={selectedCoins.length <= 1 ? 'Must track at least 1 coin' : 'Remove coin'}
                    aria-label={`Remove ${base}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
          <button
            onClick={() => {
              onClose();
              onOpenSearch();
            }}
            className="flex-1 min-h-[44px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-medium text-xs sm:text-sm rounded-xl px-4 py-2.5 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-rose-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>Search & Add Binance Coin</span>
          </button>

          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
