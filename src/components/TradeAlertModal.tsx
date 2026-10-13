import React, { useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { TrapAnalysis } from '../types/crypto';
import { getSignalDirection } from '../utils/tradeSignals';

interface TradeAlertModalProps {
  analysis: TrapAnalysis | null;
  livePrice: number | undefined;
  onBookTrade: (analysis: TrapAnalysis, entryPrice: number) => void;
  onDismiss: () => void;
}

const formatPrice = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: value >= 1_000 ? 2 : value >= 1 ? 4 : 8,
  maximumFractionDigits: 8,
})}`;

export const TradeAlertModal: React.FC<TradeAlertModalProps> = ({
  analysis,
  livePrice,
  onBookTrade,
  onDismiss,
}) => {
  useEffect(() => {
    if (!analysis) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [analysis, onDismiss]);

  if (!analysis) return null;

  const entryPrice = livePrice && Number.isFinite(livePrice) && livePrice > 0
    ? livePrice
    : analysis.currentPrice;
  const direction = getSignalDirection(analysis);
  const isLong = direction === 'LONG';
  const DirectionIcon = isLong ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        aria-labelledby="trade-alert-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50"
        role="dialog"
      >
        <div className={`h-1.5 ${isLong ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isLong ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>
                <DirectionIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400">
                  New trade signal
                </p>
                <h2 id="trade-alert-title" className="mt-1 text-xl font-black text-white">
                  {direction} {analysis.symbol}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{analysis.headline}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
              aria-label="Dismiss trade alert"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-2xl border border-cyan-900/70 bg-cyan-950/30 p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-300">Live entry price</p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                {formatPrice(entryPrice)}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-900/60 bg-rose-950/20 p-3.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-rose-300">Stop loss</p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-white">
                {formatPrice(analysis.suggestedSL ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-3.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">Target</p>
              <p className="mt-1 font-mono text-base font-bold tabular-nums text-white">
                {formatPrice(analysis.suggestedTarget ?? 0)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Rule-based signal only. Review the levels before confirming your simulated trade.
          </p>

          <button
            type="button"
            onClick={() => onBookTrade(analysis, entryPrice)}
            className={`mt-5 min-h-12 w-full rounded-xl font-bold text-slate-950 transition ${isLong ? 'bg-emerald-400 hover:bg-emerald-300' : 'bg-rose-400 hover:bg-rose-300'}`}
          >
            Book Trade
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-2 min-h-10 w-full rounded-xl text-sm font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </section>
    </div>
  );
};
