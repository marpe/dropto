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
    <header className="w-full max-w-5xl mx-auto px-4 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-xl bg-zinc-900 border border-brand-500/40 flex items-center justify-center shadow-lg shadow-brand-500/15 group hover:border-brand-500 transition-all">
          <div className="absolute inset-0 bg-brand-500/10 rounded-xl blur-sm group-hover:bg-brand-500/20 transition-all" />
          <svg className="w-5 h-5 text-brand-500 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4M17 9l-5-5-5 5M12 4v12" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
              DropWave
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/30">
              10GB P2P
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
            Direct WebRTC streaming • Zero cloud storage • 100% private
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {connected && (
          <div className="relative flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-500 border border-brand-500/30 mr-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
            </span>
            <Radio className="w-3.5 h-3.5" />
            <span>P2P Live</span>
          </div>
        )}

        {/* GitHub Repository Link */}
        <a
          href="https://github.com/marpe/send"
          target="_blank"
          rel="noopener noreferrer"
          title="View repository on GitHub"
          className="p-2 rounded-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-brand-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all hover:scale-105"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>

        <button
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all hover:scale-105"
        >
          {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings (STUN/TURN & Signaling)"
          className="p-2 rounded-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-brand-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all hover:scale-105"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
