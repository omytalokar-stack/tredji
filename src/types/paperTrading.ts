export type PaperTradeDirection = 'LONG' | 'SHORT';
export type PaperTradeStatus = 'OPEN' | 'CLOSED';

export interface PaperTrade {
  id: string;
  symbol: string;
  direction: PaperTradeDirection;
  status: PaperTradeStatus;
  entryPrice: number;
  notional: number;
  entryAt: number;
  signalType: string;
  exitPrice?: number;
  exitAt?: number;
  realizedPnl?: number;
}

export interface PaperTradingState {
  availableFunding: number;
  allocationPercent: number;
  trades: PaperTrade[];
}
