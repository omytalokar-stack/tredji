/**
 * Full-screen blocking UI
 * MUST block the main UI if connection is pending, fails, or returns no data.
 * The UI should ONLY render when real data is successfully streaming.
 */
import React from 'react';
import { AlertTriangle, RefreshCw, Radio, Wifi, WifiOff } from 'lucide-react';

interface LiveConnectionOverlayProps {
  isPending: boolean;
  hasError: boolean;
  errorMessage?: string;
  hasData: boolean;
  onRetry: () => void;
}

export const LiveConnectionOverlay: React.FC<LiveConnectionOverlayProps> = ({
  isPending,
  hasError,
  errorMessage,
  hasData,
  onRetry,
}) => {
  // If we already have real live streaming data and no fatal error, don't block
  if (!isPending && !hasError && hasData) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-6 text-center select-none">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.12),transparent_70%)] pointer-events-none" />

      <div className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
        {hasError ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-5">
              <WifiOff className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-2 tracking-tight">
              Error: Cannot connect to Live API
            </h2>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              {errorMessage || 'Unable to establish a live data connection with Binance WebSocket/REST endpoints. Please verify your internet connection.'}
            </p>

            <button
              onClick={onRetry}
              className="w-full min-h-[48px] bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-medium text-sm rounded-xl px-5 py-3 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Live Connection</span>
            </button>
          </>
        ) : (
          <>
            <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
              <div className="absolute inset-0 rounded-2xl bg-emerald-950/60 border border-emerald-700/50 animate-pulse" />
              <Radio className="w-8 h-8 text-emerald-400 animate-spin" style={{ animationDuration: '4s' }} />
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-2 tracking-tight">
              Waiting for Live Market Data...
            </h2>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Connecting to Binance real-time WebSocket stream & verifying historical 20-candle order flow. Zero mock data allowed.
            </p>

            <div className="w-full bg-slate-950/80 rounded-xl p-3 border border-slate-800/80 flex items-center justify-center gap-3 text-xs font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>wss://stream.binance.com:9443</span>
            </div>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-slate-800/60 w-full flex items-center justify-between text-xs text-slate-500">
          <span>TrapDetector AI Engine</span>
          <span className="font-mono">Live WebSocket</span>
        </div>
      </div>
    </div>
  );
};
