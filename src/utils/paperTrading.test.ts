import assert from 'node:assert/strict';
import test from 'node:test';
import { PaperTrade } from '../types/paperTrading';
import { calculatePaperPnl, closePaperTrade, isPaperTradingState } from './paperTrading';
import { getSignalDirection } from './tradeSignals';

const trade: PaperTrade = {
  id: 'paper-1',
  symbol: 'BTCUSDT',
  direction: 'LONG',
  status: 'OPEN',
  entryPrice: 50_000,
  notional: 1_000,
  entryAt: 1_000,
  signalType: 'STOP_LOSS_HUNT_ENTRY',
};

test('paper PnL uses entry-price quantity and handles both directions', () => {
  assert.equal(calculatePaperPnl('LONG', 100, 110, 1_000), 100);
  assert.equal(calculatePaperPnl('SHORT', 100, 90, 1_000), 100);
  assert.equal(calculatePaperPnl('SHORT', 100, 110, 1_000), -100);
  assert.throws(() => calculatePaperPnl('LONG', 0, 110, 1_000), RangeError);
});

test('closing a paper trade stores realized PnL and close time', () => {
  const closed = closePaperTrade(trade, 55_000, 2_000);
  assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.realizedPnl, 100);
  assert.equal(closed.exitPrice, 55_000);
  assert.equal(closed.exitAt, 2_000);
  assert.throws(() => closePaperTrade(closed, 56_000), /Only open/);
});

test('paper trading persistence accepts valid states and rejects malformed trades', () => {
  assert.equal(isPaperTradingState({
    availableFunding: 9_000,
    allocationPercent: 5,
    trades: [trade],
  }), true);
  assert.equal(isPaperTradingState({
    availableFunding: 9_000,
    allocationPercent: 101,
    trades: [trade],
  }), false);
  assert.equal(isPaperTradingState({
    availableFunding: 9_000,
    allocationPercent: 5,
    trades: [{ ...trade, entryPrice: 0 }],
  }), false);
});

test('trade alerts preserve the signal direction for bearish scalps', () => {
  assert.equal(getSignalDirection({
    signalType: 'STOP_LOSS_HUNT_ENTRY',
    actionAdvice: 'SMART MONEY BUY.',
  }), 'LONG');
  assert.equal(getSignalDirection({
    signalType: 'SCALP_OPPORTUNITY',
    actionAdvice: 'SCALP SHORT. Breakdown confirmed only with bearish consensus.',
  }), 'SHORT');
  assert.equal(getSignalDirection({
    signalType: 'SCALP_OPPORTUNITY',
    actionAdvice: 'SCALP LONG. Breakout confirmed only with bullish consensus.',
  }), 'LONG');
  assert.equal(getSignalDirection({
    signalType: 'RETAIL_TRAP_BHEED',
    actionAdvice: 'DO NOT CHASE.',
  }), 'SHORT');
});
