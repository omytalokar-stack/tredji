/**
 * Top Header Component
 * Contains CuteLogo on top left and Search Box trigger for real Binance tickers
 */
import React from 'react';
import { Search, Radio, Settings, UserRound } from 'lucide-react';
import { CuteLogo } from './CuteLogo';

interface TopHeaderProps {
  coinCount: number;
  maxCoins: number;
  onOpenSelectedCoins: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  isConnected: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  coinCount,
  maxCoins,
  onOpenSelectedCoins,
  onOpenSearch,
  onOpenSettings,
  onOpenProfile,
  isConnected,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-2 sm:px-6 lg:px-8 py-2.5 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-6">
        {/* Left: Cute Logo & Coins Drawer Trigger */}
        <CuteLogo
          coinCount={coinCount}
          maxCoins={maxCoins}
          onClick={onOpenSelectedCoins}
        />

        {/* Center / Right: Search Box Trigger */}
        <div className="flex-1 min-w-0 max-w-sm md:max-w-2xl flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-full min-w-0 min-h-[44px] flex items-center justify-between gap-2.5 px-2.5 sm:px-3.5 md:px-5 py-2 bg-slate-900 hover:bg-slate-850 active:scale-[0.99] border border-slate-800 hover:border-slate-700 rounded-xl text-left text-xs sm:text-sm text-slate-400 hover:text-slate-200 transition-all duration-300 cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
            aria-label="Search Binance tickers"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">Search Binance tickers...</span>
            </div>
            <span className="hidden sm:inline text-[11px] font-mono text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60 shrink-0">
              24/7 Live
            </span>
          </button>

          {/* Connection Live status indicator */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 shrink-0 min-h-[44px]"
            title={isConnected ? 'Connected to Binance WebSocket' : 'Connecting...'}
          >
            <Radio
              className={`w-3.5 h-3.5 ${
                isConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
              }`}
            />
            <span className="hidden md:inline">{isConnected ? 'LIVE' : 'SYNC'}</span>
          </div>
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-all duration-300"
            aria-label="Open paper trading profile"
            title="Paper Trading Profile"
          >
            <UserRound className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-11 h-11 shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition-all duration-300"
            aria-label="Open settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
