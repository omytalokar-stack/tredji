import { TrapAnalysis } from '../types/crypto';
import { PaperTradeDirection } from '../types/paperTrading';

export function getSignalDirection(
  analysis: Pick<TrapAnalysis, 'signalType' | 'actionAdvice'>
): PaperTradeDirection {
  if (analysis.signalType === 'STOP_LOSS_HUNT_ENTRY') return 'LONG';
  if (analysis.signalType === 'SCALP_OPPORTUNITY') {
    return /\bSCALP\s+SHORT\b/i.test(analysis.actionAdvice) ? 'SHORT' : 'LONG';
  }
  return 'SHORT';
}
