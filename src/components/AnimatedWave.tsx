import React from 'react';

interface AnimatedWaveProps {
  active: boolean;
  className?: string;
}

export const AnimatedWave: React.FC<AnimatedWaveProps> = ({ active, className = '' }) => {
  return (
    <div className={`relative w-full h-8 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 ${className}`}>
      <svg
        className={`w-[200%] h-full text-brand-500 opacity-75 ${active ? 'animate-[wave_3s_linear_infinite]' : ''}`}
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1000,50 C1100,90 1150,20 1200,60 L1200,120 L0,120 Z"
          fill="url(#wave-gradient)"
        />
        <defs>
          <linearGradient id="wave-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3ECF8E" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#3ECF8E" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#24B47E" stopOpacity="0.1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-mono tracking-widest uppercase font-bold text-zinc-600 dark:text-zinc-400">
          {active ? 'P2P Stream Active' : 'P2P Stream Idle'}
        </span>
      </div>
    </div>
  );
};
