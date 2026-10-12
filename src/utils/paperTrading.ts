import { PaperTrade, PaperTradeDirection } from '../types/paperTrading';

export function calculatePaperPnl(
  direction: PaperTradeDirection,
  entryPrice: number,
  currentPrice: number,
  notional: number
): number {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(notional) ||
    entryPrice <= 0 ||
    currentPrice <= 0 ||
    notional < 0
  ) {
    throw new RangeError('Paper PnL requires positive prices and a non-negative position size.');
  }
  const quantity = notional / entryPrice;
  return (direction === 'LONG' ? 1 : -1) * (currentPrice - entryPrice) * quantity;
}

export function closePaperTrade(trade: PaperTrade, exitPrice: number, exitAt = Date.now()): PaperTrade {
  if (trade.status !== 'OPEN') throw new Error('Only open paper trades can be closed.');
  return {
    ...trade,
    status: 'CLOSED',
    exitPrice,
    exitAt,
    realizedPnl: calculatePaperPnl(
      trade.direction,
      trade.entryPrice,
      exitPrice,
      trade.notional
    ),
  };
}

export function isPaperTradingState(value: unknown): value is {
  availableFunding: number;
  allocationPercent: number;
  trades: PaperTrade[];
} {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return Number.isFinite(state.availableFunding) &&
    Number.isFinite(state.allocationPercent) &&
    Number(state.allocationPercent) >= 0 &&
    Number(state.allocationPercent) <= 100 &&
    Array.isArray(state.trades) &&
    state.trades.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const trade = item as Record<string, unknown>;
      return typeof trade.id === 'string' &&
        typeof trade.symbol === 'string' &&
        (trade.direction === 'LONG' || trade.direction === 'SHORT') &&
        (trade.status === 'OPEN' || trade.status === 'CLOSED') &&
        Number.isFinite(trade.entryPrice) &&
        Number(trade.entryPrice) > 0 &&
        Number.isFinite(trade.notional) &&
        Number(trade.notional) > 0 &&
        Number.isFinite(trade.entryAt) &&
        typeof trade.signalType === 'string' &&
        (trade.status === 'OPEN' ||
          (Number.isFinite(trade.exitPrice) &&
            Number(trade.exitPrice) > 0 &&
            Number.isFinite(trade.exitAt) &&
            Number.isFinite(trade.realizedPnl)));
    });
}
