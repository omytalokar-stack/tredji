/**
 * Search Ticker Modal
 * Connects directly to real Binance WebSocket stream & REST API.
 * ZERO MOCK DATA. NO FAKE ARRAYS. NO RANDOM NUMBERS.
 */
import React, { useState, useMemo } from 'react';
import { Search, X, Plus, Check, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react';
import { BinanceSearchResult } from '../types/crypto';

interface SearchTickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCoins: string[];
  maxCoins: number;
  streamedTickers: BinanceSearchResult[];
  onAddCoin: (symbol: string) => { success: boolean; message: string };
  onRemoveCoin: (symbol: string) => { success: boolean; message: string };
  onReplaceCoin: (oldSymbol: string, newSymbol: string) => { success: boolean; message: string };
}

export const SearchTickerModal: React.FC<SearchTickerModalProps> = ({
  isOpen,
  onClose,
  selectedCoins,
  maxCoins,
  streamedTickers,
  onAddCoin,
  onRemoveCoin,
  onReplaceCoin,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter directly from real Binance streamed tickers
  const filteredResults = useMemo(() => {
    const query = searchTerm.trim().toUpperCase();
    if (!query) {
      // Return top liquid streamed pairs by volume
      return streamedTickers.slice(0, 30);
    }
    return streamedTickers
      .filter((coin) => coin.symbol.includes(query) || coin.baseAsset.includes(query))
      .slice(0, 30);
  }, [streamedTickers, searchTerm]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const isAtLimit = selectedCoins.length >= maxCoins;

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    return val.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  const formatVolume = (val: number) => {
    if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    return `$${(val / 1_000).toFixed(0)}K`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full sm:max-w-xl lg:max-w-2xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl flex flex-col h-[94dvh] sm:h-auto max-h-[94dvh] transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                Search Binance Markets
              </h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-md">
                Live WebSocket Stream
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select up to {maxCoins} coins to track 24/7. Tracking: {selectedCoins.length}/{maxCoins}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close search"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mt-3 p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center justify-between">
            <span>{toastMessage}</span>
            <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* Replace Prompt when 5 coins limit reached */}
        {replaceTarget && (
          <div className="mt-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-xs text-amber-200 flex flex-col gap-2">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>Limit of {maxCoins} reached. Choose which coin to replace with {replaceTarget}:</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedCoins.map((oldSym) => (
                <button
                  key={oldSym}
                  onClick={() => {
                    const res = onReplaceCoin(oldSym, replaceTarget);
                    showToast(res.message);
                    setReplaceTarget(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-amber-700/80 font-mono text-xs text-white font-semibold transition-colors cursor-pointer"
                >
                  Replace {oldSym.replace('USDT', '')}
                </button>
              ))}
              <button
                onClick={() => setReplaceTarget(null)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search Input Box */}
        <div className="relative my-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search real Binance coin (e.g. BTC, ETH, SOL, PEPE, SUI, XRP)..."
            className="w-full min-h-[46px] pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 font-medium"
            autoFocus
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results Container */}
        <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
          {filteredResults.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              No matching Binance USDT pairs found for &quot;{searchTerm}&quot;.
            </div>
          ) : (
            filteredResults.map((coin) => {
              const isSelected = selectedCoins.includes(coin.symbol);
              const isPositive = coin.priceChangePercent >= 0;

              return (
                <div
                  key={coin.symbol}
                  className={`p-3 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-2 sm:gap-3 ${
                    isSelected
                      ? 'bg-slate-950/90 border-rose-900/60'
                      : 'bg-slate-950/50 border-slate-850 hover:border-slate-750'
                  }`}
                >
                  {/* Left: Asset info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-bold text-xs text-slate-200 shrink-0">
                      {coin.baseAsset.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-100">{coin.baseAsset}</span>
                        <span className="text-xs font-mono text-slate-400">/USDT</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        24h Vol: {formatVolume(coin.quoteVolume)}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Price & Add Button */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-100 tabular-nums">
                        ${formatPrice(coin.price)}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-semibold flex items-center justify-end tabular-nums ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{coin.priceChangePercent.toFixed(2)}%</span>
                      </div>
                    </div>

                    {/* Action button */}
                    {isSelected ? (
                      <button
                        onClick={() => {
                          const res = onRemoveCoin(coin.symbol);
                          showToast(res.message);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-rose-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        title="Remove from tracked coins"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tracked</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (isAtLimit) {
                            setReplaceTarget(coin.symbol);
                          } else {
                            const res = onAddCoin(coin.symbol);
                            showToast(res.message);
                          }
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-rose-950/40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isAtLimit ? 'Swap' : 'Track'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline">Real-time Binance WebSocket feed · Max {maxCoins} coins</span>
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
