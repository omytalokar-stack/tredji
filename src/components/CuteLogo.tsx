/**
 * Top Left Cute Mascot Logo
 * Clicking it reveals the current "Selected Coins" (max 5 coins limit)
 */
import React from 'react';

interface CuteLogoProps {
  coinCount: number;
  maxCoins: number;
  onClick: () => void;
}

export const CuteLogo: React.FC<CuteLogoProps> = ({ coinCount, maxCoins, onClick }) => {
  return (
    <button
      onClick={onClick}
      type="button"
      className="group flex items-center gap-1.5 sm:gap-2.5 px-1 sm:px-2 py-1.5 rounded-xl hover:bg-slate-850/80 active:scale-95 transition-all duration-300 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 min-h-[44px] cursor-pointer"
      title="Click to view & manage your 5 Selected Coins"
      aria-label="View Selected Coins"
    >
      {/* Cute Mascot Icon */}
      <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-400 p-[1.5px] shadow-md shadow-rose-950/40 group-hover:shadow-rose-900/60 transition-shadow duration-300">
        <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center overflow-hidden">
          {/* Custom Cute Sentinel Fox / Trap Mascot SVG */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6 text-rose-400 group-hover:scale-110 transition-transform duration-200"
          >
            {/* Cute Ears */}
            <path d="M7 6L12 14H6L7 6Z" fill="#F43F5E" />
            <path d="M25 6L20 14H26L25 6Z" fill="#F43F5E" />
            <path d="M8 8L11 13H7L8 8Z" fill="#FDA4AF" />
            <path d="M24 8L21 13H25L24 8Z" fill="#FDA4AF" />
            {/* Cute Face Contour */}
            <path
              d="M16 26C21.5 26 26 21 26 15C26 10 21.5 10 16 10C10.5 10 6 10 6 15C6 21 10.5 26 16 26Z"
              fill="#1E293B"
            />
            {/* Radar / Trap Cheeks */}
            <circle cx="10" cy="18" r="2" fill="#FB7185" opacity="0.6" />
            <circle cx="22" cy="18" r="2" fill="#FB7185" opacity="0.6" />
            {/* Glowing Keen Eyes */}
            <circle cx="12" cy="15" r="2" fill="#38BDF8" />
            <circle cx="20" cy="15" r="2" fill="#38BDF8" />
            <circle cx="12.5" cy="14.5" r="0.8" fill="#FFFFFF" />
            <circle cx="20.5" cy="14.5" r="0.8" fill="#FFFFFF" />
            {/* Cute Snout & Radar Nose */}
            <path d="M14.5 20L16 18.5L17.5 20L16 21.5L14.5 20Z" fill="#F43F5E" />
            <path d="M16 21.5V23" stroke="#F43F5E" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        {/* Live indicator pip */}
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-slate-950 rounded-full" />
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-bold text-xs sm:text-sm text-slate-100 tracking-tight">TrapDetector</span>
          <span className="text-[10px] font-semibold text-rose-400 font-mono bg-rose-950/60 border border-rose-900/60 rounded px-1 py-0.5">
            AI
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-[11px] text-slate-400 font-mono">
          <span className="text-slate-300 font-semibold">{coinCount}/{maxCoins}</span>
          <span>coins tracked</span>
          <span className="text-rose-400 group-hover:translate-x-0.5 transition-transform text-[10px]">▼</span>
        </div>
      </div>
    </button>
  );
};
