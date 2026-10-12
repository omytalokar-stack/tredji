import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PaperTrade, PaperTradeDirection, PaperTradingState } from '../types/paperTrading';
import { closePaperTrade, isPaperTradingState } from '../utils/paperTrading';

const STORAGE_KEY = 'trapdetector_paper_trading_v1';
const INITIAL_STATE: PaperTradingState = {
  availableFunding: 10_000,
  allocationPercent: 5,
  trades: [],
};

function readState(): PaperTradingState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_STATE;
    const parsed: unknown = JSON.parse(saved);
    if (!isPaperTradingState(parsed)) {
      console.warn('Saved paper-trading data is invalid; starting with the default portfolio.');
      return INITIAL_STATE;
    }
    return parsed;
  } catch (error) {
    console.error('Unable to read saved paper-trading data.', error);
    return INITIAL_STATE;
  }
}

export function usePaperTrading() {
  const [state, setState] = useState<PaperTradingState>(readState);
  const stateRef = useRef(state);

  const updateState = useCallback((update: (current: PaperTradingState) => PaperTradingState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Unable to save paper-trading data to local storage.', error);
    }
  }, [state]);

  const setAvailableFunding = useCallback((funding: number) => {
    if (!Number.isFinite(funding) || funding < 0) {
      throw new RangeError('Available funding must be a non-negative amount.');
    }
    updateState((current) => ({ ...current, availableFunding: funding }));
  }, [updateState]);

  const setAllocationPercent = useCallback((percent: number) => {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new RangeError('Position size must be between 0 and 100 percent.');
    }
    updateState((current) => ({ ...current, allocationPercent: percent }));
  }, [updateState]);

  const openTrade = useCallback((
    symbol: string,
    direction: PaperTradeDirection,
    entryPrice: number,
    signalType: string
  ): PaperTrade => {
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new RangeError('A valid live market price is required to book a trade.');
    }
    const current = stateRef.current;
    const notional = current.availableFunding * current.allocationPercent / 100;
    if (notional <= 0) throw new RangeError('Set positive funding and position size before booking.');
    const created: PaperTrade = {
        id: crypto.randomUUID(),
        symbol,
        direction,
        status: 'OPEN',
        entryPrice,
        notional,
        entryAt: Date.now(),
        signalType,
    };
    updateState((latest) => ({
      ...latest,
      availableFunding: latest.availableFunding - notional,
      trades: [created, ...latest.trades],
    }));
    return created;
  }, [updateState]);

  const closeTrade = useCallback((id: string, exitPrice: number) => {
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      throw new RangeError('A valid live market price is required to close a trade.');
    }
    updateState((current) => {
      const trade = current.trades.find((item) => item.id === id && item.status === 'OPEN');
      if (!trade) throw new Error('The selected paper trade is no longer open.');
      const closedTrade = closePaperTrade(trade, exitPrice);
      return {
        ...current,
        availableFunding: current.availableFunding + trade.notional + closedTrade.realizedPnl!,
        trades: current.trades.map((item) => item.id === id ? closedTrade : item),
      };
    });
  }, [updateState]);

  return { ...state, setAvailableFunding, setAllocationPercent, openTrade, closeTrade };
}

type PaperTradingStore = ReturnType<typeof usePaperTrading>;

const PaperTradingContext = createContext<PaperTradingStore | null>(null);

export const PaperTradingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const paperTrading = usePaperTrading();
  return (
    <PaperTradingContext.Provider value={paperTrading}>
      {children}
    </PaperTradingContext.Provider>
  );
};

export function usePaperTradingContext(): PaperTradingStore {
  const context = useContext(PaperTradingContext);
  if (!context) throw new Error('usePaperTradingContext must be used within PaperTradingProvider.');
  return context;
}
