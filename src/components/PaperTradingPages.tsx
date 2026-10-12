import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  BriefcaseBusiness,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { TrapAnalysis } from '../types/crypto';
import { PaperTrade, PaperTradeDirection } from '../types/paperTrading';
import { calculatePaperPnl } from '../utils/paperTrading';

const HistoricalPnlChart = React.lazy(() =>
  import('./HistoricalPnlChart').then((module) => ({ default: module.HistoricalPnlChart }))
);

interface TradeDraft {
  symbol: string;
  direction: PaperTradeDirection;
  signalType: string;
}

interface ProfilePageProps {
  availableFunding: number;
  allocationPercent: number;
  trades: PaperTrade[];
  prices: Record<string, number>;
  draft: TradeDraft | null;
  analysis?: TrapAnalysis;
  onFundingChange: (value: number) => void;
  onAllocationChange: (value: number) => void;
  onOpenTrade: (symbol: string, direction: PaperTradeDirection, signalType: string) => void;
  onCloseTrade: (id: string, price: number) => void;
  onOpenHistory: () => void;
  onClearDraft: () => void;
}

interface OrderHistoryPageProps {
  trades: PaperTrade[];
  onBack: () => void;
}

const money = (value: number) => `$${value.toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const price = (value: number) => value.toLocaleString('en-US', {
  minimumFractionDigits: value >= 1_000 ? 2 : value >= 1 ? 4 : 8,
  maximumFractionDigits: 8,
});

function pnlFor(trade: PaperTrade, markPrice: number): number {
  if (trade.status === 'CLOSED') return trade.realizedPnl ?? 0;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return 0;
  return calculatePaperPnl(trade.direction, trade.entryPrice, markPrice, trade.notional);
}

function formatDuration(start: number, end: number): string {
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function isSamePeriod(timestamp: number, unit: 'day' | 'month' | 'year'): boolean {
  const date = new Date(timestamp);
  const now = new Date();
  if (unit === 'year') return date.getFullYear() === now.getFullYear();
  if (date.getFullYear() !== now.getFullYear()) return false;
  return unit === 'month'
    ? date.getMonth() === now.getMonth()
    : date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  availableFunding,
  allocationPercent,
  trades,
  prices,
  draft,
  analysis,
  onFundingChange,
  onAllocationChange,
  onOpenTrade,
  onCloseTrade,
  onOpenHistory,
  onClearDraft,
}) => {
  const [fundingInput, setFundingInput] = useState(String(availableFunding));
  const [percentInput, setPercentInput] = useState(String(allocationPercent));
  const [actionError, setActionError] = useState('');
  const openTrades = trades.filter((trade) => trade.status === 'OPEN');
  const closedTrades = trades.filter((trade) => trade.status === 'CLOSED');
  const tradeSize = availableFunding * allocationPercent / 100;

  useEffect(() => {
    setFundingInput(String(availableFunding));
  }, [availableFunding]);

  const stats = useMemo(() => {
    const pnlForPeriod = (unit: 'day' | 'month' | 'year') =>
      closedTrades
        .filter((trade) => isSamePeriod(trade.exitAt ?? 0, unit))
        .reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    return {
      daily: pnlForPeriod('day'),
      monthly: pnlForPeriod('month'),
      yearly: pnlForPeriod('year'),
      totalLoss: closedTrades.reduce(
        (sum, trade) => sum + Math.max(0, -(trade.realizedPnl ?? 0)),
        0
      ),
    };
  }, [closedTrades]);

  const chartData = useMemo(() => {
    const byDate = new Map<string, { date: string; profit: number; loss: number }>();
    for (const trade of closedTrades) {
      const date = new Date(trade.exitAt ?? trade.entryAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const current = byDate.get(key) ?? { date: label, profit: 0, loss: 0 };
      const pnl = trade.realizedPnl ?? 0;
      if (pnl >= 0) current.profit += pnl;
      else current.loss += pnl;
      byDate.set(key, current);
    }
    return [...byDate.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-14)
      .map(([, value]) => value);
  }, [closedTrades]);

  const bookTrade = () => {
    if (!draft) return;
    const livePrice = prices[draft.symbol];
    if (!livePrice) {
      setActionError(`Waiting for a live Binance price for ${draft.symbol}.`);
      return;
    }
    try {
      onOpenTrade(draft.symbol, draft.direction, draft.signalType);
      setActionError('');
      onClearDraft();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to book this paper trade.');
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-300">Paper portfolio</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-white">Trading Profile</h1>
          <p className="mt-1 text-sm text-slate-400">Simulated, unleveraged positions marked to live Binance prices.</p>
        </div>
        <button type="button" onClick={onOpenHistory} className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">
          <BookOpen className="h-4 w-4" /> Order History
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <BriefcaseBusiness className="h-4 w-4 text-cyan-300" /> Available Funding
          </div>
          <label className="mt-4 block text-xs uppercase tracking-wide text-slate-400" htmlFor="paper-funding">Available USDT</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3">
            <span className="text-slate-400">$</span>
            <input
              id="paper-funding"
              className="min-h-12 w-full bg-transparent font-mono text-lg text-white outline-none"
              type="number"
              min="0"
              step="100"
              value={fundingInput}
              onChange={(event) => setFundingInput(event.target.value)}
              onBlur={() => {
                const value = Number(fundingInput);
                if (Number.isFinite(value) && value >= 0) onFundingChange(value);
                else setFundingInput(String(availableFunding));
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Position notional is reserved when a trade is booked and returned with realized PnL when it closes.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-white">Position Sizing</h2>
              <p className="mt-1 text-xs text-slate-400">Choose the share of available funding allocated to the next position.</p>
            </div>
            <span className="font-mono text-lg font-bold text-cyan-200">{money(tradeSize)}</span>
          </div>
          <div className="mt-5 grid grid-cols-[1fr_6rem] items-center gap-4">
            <input
              aria-label="Position size percentage slider"
              className="h-2 w-full cursor-pointer accent-cyan-400"
              type="range"
              min="1"
              max="100"
              step="1"
              value={Math.max(1, allocationPercent)}
              onChange={(event) => {
                const value = Number(event.target.value);
                setPercentInput(String(value));
                onAllocationChange(value);
              }}
            />
            <div className="relative">
              <input
                aria-label="Position size percentage"
                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 pr-6 text-right font-mono text-white outline-none focus:border-cyan-500"
                type="number"
                min="0"
                max="100"
                step="1"
                value={percentInput}
                onChange={(event) => {
                  const raw = event.target.value;
                  setPercentInput(raw);
                  if (raw === '') return;
                  const value = Number(raw);
                  if (Number.isFinite(value) && value >= 0 && value <= 100) onAllocationChange(value);
                }}
                onBlur={() => setPercentInput(String(allocationPercent))}
              />
              <span className="pointer-events-none absolute right-2 top-3 text-xs text-slate-500">%</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-mono text-slate-500"><span>1%</span><span>100%</span></div>
        </div>
      </div>

      {draft && (
        <div className="rounded-2xl border border-cyan-800/70 bg-cyan-950/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-cyan-300">Signal trade ticket</div>
              <h2 className="mt-1 text-xl font-bold text-white">{draft.direction} {draft.symbol}</h2>
              <p className="mt-1 text-sm text-slate-300">{draft.signalType.replaceAll('_', ' ')} · market entry from the current Binance WebSocket price</p>
              {analysis?.suggestedSL !== undefined && analysis.suggestedTarget !== undefined && (
                <p className="mt-2 text-xs font-mono text-slate-300">Signal reference · SL {price(analysis.suggestedSL)} · Target {price(analysis.suggestedTarget)}</p>
              )}
            </div>
            <button type="button" onClick={bookTrade} disabled={allocationPercent <= 0 || tradeSize <= 0} className="min-h-11 rounded-xl bg-cyan-400 px-5 font-bold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
              Confirm Paper Trade · {money(tradeSize)}
            </button>
          </div>
          {actionError && <p role="alert" className="mt-3 text-sm text-rose-300">{actionError}</p>}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div><h2 className="text-xl font-bold text-white">Live Trades</h2><p className="mt-1 text-xs text-slate-400">PnL updates from live Binance WebSocket ticker prices.</p></div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-mono text-slate-300">{openTrades.length} open</span>
        </div>
        {openTrades.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-sm text-slate-400">No active paper trades. Book an eligible TrapDetector signal to start a simulation.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-950/80 text-xs uppercase text-slate-500"><tr>{['Market', 'Side', 'Entry', 'Live Price', 'Size', 'Unrealized PnL', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
              <tbody>{openTrades.map((trade) => {
                const livePrice = prices[trade.symbol] ?? trade.entryPrice;
                const pnl = pnlFor(trade, livePrice);
                return <tr key={trade.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-semibold text-white">{trade.symbol}</td>
                  <td className={`px-4 py-3 font-bold ${trade.direction === 'LONG' ? 'text-emerald-300' : 'text-rose-300'}`}>{trade.direction}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{price(trade.entryPrice)}</td>
                  <td className="px-4 py-3 font-mono text-white">{prices[trade.symbol] ? price(livePrice) : 'Waiting…'}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{money(trade.notional)}</td>
                  <td className={`px-4 py-3 font-mono font-bold ${pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pnl >= 0 ? '+' : ''}{money(pnl)}</td>
                  <td className="px-4 py-3"><button type="button" disabled={!prices[trade.symbol]} onClick={() => {
                    try {
                      onCloseTrade(trade.id, prices[trade.symbol]);
                      setActionError('');
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : 'Unable to close the paper trade.');
                    }
                  }} className="rounded-lg border border-rose-800 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950 disabled:cursor-not-allowed disabled:opacity-40">Close Trade</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {actionError && !draft && <p role="alert" className="text-sm text-rose-300">{actionError}</p>}
      </section>

      <section className="space-y-4">
        <div><h2 className="text-xl font-bold text-white">Portfolio Analytics</h2><p className="mt-1 text-xs text-slate-400">Realized PnL is computed from closed paper trades only.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Daily PnL', value: stats.daily },
            { label: 'Monthly PnL', value: stats.monthly },
            { label: 'Yearly PnL', value: stats.yearly },
            { label: 'Total Loss', value: stats.totalLoss, isLoss: true },
          ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
            <div className={`mt-2 font-mono text-xl font-bold ${stat.isLoss || stat.value < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{money(stat.value)}</div>
          </div>)}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Historical Profit vs Loss · Closed Trades</h3>
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">Closed trade results will appear here.</div>
          ) : (
            <Suspense fallback={<div className="flex h-[280px] items-center justify-center text-sm text-slate-500">Loading chart…</div>}>
              <HistoricalPnlChart data={chartData} />
            </Suspense>
          )}
          <div className="mt-2 flex justify-center gap-5 text-xs text-slate-400"><span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-300" />Profit</span><span className="inline-flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-rose-300" />Loss</span></div>
        </div>
      </section>
    </section>
  );
};

export const OrderHistoryPage: React.FC<OrderHistoryPageProps> = ({ trades, onBack }) => {
  const [filter, setFilter] = useState<'ALL' | 'PROFITS' | 'LOSSES'>('ALL');
  const closedTrades = trades.filter((trade) => trade.status === 'CLOSED');
  const filteredTrades = closedTrades.filter((trade) =>
    filter === 'ALL' ||
    (filter === 'PROFITS' && (trade.realizedPnl ?? 0) > 0) ||
    (filter === 'LOSSES' && (trade.realizedPnl ?? 0) <= 0)
  );

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-mono uppercase tracking-widest text-cyan-300">Paper portfolio</p><h1 className="mt-1 text-2xl sm:text-3xl font-black text-white">Order History</h1></div>
        <button type="button" onClick={onBack} className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /> Trading Profile</button>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Trade result filters">
        {(['ALL', 'PROFITS', 'LOSSES'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} onClick={() => setFilter(item)} className={`min-h-10 rounded-xl border px-4 text-xs font-bold ${filter === item ? 'border-cyan-400 bg-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{item === 'ALL' ? 'All' : item === 'PROFITS' ? 'Profits' : 'Losses'}</button>)}
      </div>
      {filteredTrades.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center text-sm text-slate-400">No closed trades match this filter.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-950/80 text-xs uppercase text-slate-500"><tr>{['Market / Side', 'Entry Price', 'Exit Price', 'Margin', 'Realized PnL', 'ROI', 'Duration', 'Closed'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
            <tbody>{filteredTrades.map((trade) => {
              const realizedPnl = trade.realizedPnl ?? 0;
              const roi = trade.notional ? realizedPnl / trade.notional * 100 : 0;
              const profitable = realizedPnl > 0;
              return <tr key={trade.id} className="border-t border-slate-800">
                <td className="px-4 py-4"><div className="font-semibold text-white">{trade.symbol}</div><div className={`mt-1 text-xs font-bold ${trade.direction === 'LONG' ? 'text-emerald-300' : 'text-rose-300'}`}>{trade.direction}</div></td>
                <td className="px-4 py-4 font-mono text-slate-300">{price(trade.entryPrice)}</td>
                <td className="px-4 py-4 font-mono text-slate-300">{price(trade.exitPrice ?? 0)}</td>
                <td className="px-4 py-4 font-mono text-slate-300">{money(trade.notional)}</td>
                <td className={`px-4 py-4 font-mono font-bold ${profitable ? 'text-emerald-300' : 'text-rose-300'}`}>{realizedPnl >= 0 ? '+' : ''}{money(realizedPnl)}</td>
                <td className={`px-4 py-4 font-mono ${roi >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{roi >= 0 ? '+' : ''}{roi.toFixed(2)}%</td>
                <td className="px-4 py-4 font-mono text-slate-300">{formatDuration(trade.entryAt, trade.exitAt ?? trade.entryAt)}</td>
                <td className="px-4 py-4 text-xs text-slate-400">{new Date(trade.exitAt ?? trade.entryAt).toLocaleString()}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
};
