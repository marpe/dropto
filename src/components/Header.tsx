import React from 'react';
import { Sun, Moon, Settings, Radio } from 'lucide-react';

interface HeaderProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  connected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode,
  onToggleTheme,
  onOpenSettings,
  connected,
}) => {
  return (
    <header className="w-full max-w-5xl mx-auto px-4 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4M17 9l-5-5-5 5M12 4v12" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              DropWave
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-700/50">
              10GB P2P
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            Direct WebRTC streaming • Zero cloud storage • 100% private
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connected && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 mr-1 animate-pulse">
            <Radio className="w-3.5 h-3.5" />
            <span>P2P Live</span>
          </div>
        )}

        <button
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings (STUN/TURN & Signaling)"
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
