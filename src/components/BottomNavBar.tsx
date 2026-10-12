/**
 * Bottom Bar Component
 * Mobile-first thumb navigation.
 * Contains "Coins" button to reveal real-time analysis of the remaining 4 selected coins.
 */
import React from 'react';
import { Radar, Layers, Search, UserRound } from 'lucide-react';

interface BottomNavBarProps {
  onOpenCoinsDrawer: () => void;
  onOpenSearch: () => void;
  remainingCount: number;
  onOpenProfile: () => void;
  onOpenRadar: () => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  onOpenCoinsDrawer,
  onOpenSearch,
  remainingCount,
  onOpenProfile,
  onOpenRadar,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-all duration-300 lg:hidden">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-2 items-center min-h-[3.25rem]">
        {/* Tab 1: Radar (Home View) */}
        <button
          type="button"
          onClick={onOpenRadar}
          className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-rose-400 hover:text-rose-300 transition-colors cursor-pointer group"
          aria-label="Home Radar"
        >
          <Radar className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-semibold mt-1 tracking-tight">Trap Radar</span>
        </button>

        {/* Tab 2: Coins Button (CRITICAL REQUIREMENT: Clicking this reveals the real-time status of the remaining 4 coins) */}
        <button
          type="button"
          onClick={onOpenCoinsDrawer}
          className="relative flex flex-col items-center justify-center min-h-[44px] rounded-xl bg-slate-900/90 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-slate-700 text-slate-100 transition-all cursor-pointer shadow-sm group"
          aria-label="View other 4 coins status"
        >
          <div className="relative">
            <Layers className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
            {remainingCount > 0 && (
              <span className="absolute -top-1.5 -right-3 text-[10px] font-mono font-bold bg-amber-500 text-slate-950 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                {remainingCount}
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold mt-1 tracking-tight text-slate-200">
            Coins ({remainingCount})
          </span>
        </button>

        {/* Tab 3: Search / Add Market */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer group"
          aria-label="Search Binance Markets"
        >
          <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-medium mt-1 tracking-tight">Search (5 Max)</span>
        </button>

        <button
          type="button"
          onClick={onOpenProfile}
          className="flex flex-col items-center justify-center min-h-[44px] rounded-xl text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer group"
          aria-label="Open paper trading profile"
        >
          <UserRound className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-semibold mt-1 tracking-tight">Profile</span>
        </button>
      </div>
    </nav>
  );
};
