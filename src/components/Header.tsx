import React from 'react';
import { Sun, Moon, Settings, Radio } from 'lucide-react';
import { GitHubIcon } from './ui/GitHubIcon';
import { AppLogo } from './ui/AppLogo';
import { IconButton } from './ui/IconButton';
import { iconButtonClassName } from './ui/iconButtonStyles';
import { Pill } from './ui/Pill';
import { REPOSITORY_URL } from '../constants';
import { getActiveBrand } from '../branding';

interface HeaderProps {
  darkMode: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  connected: boolean;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, onToggleTheme, onOpenSettings, connected }) => {
  const brand = getActiveBrand();
  return (
    <header className="w-full max-w-3xl mx-auto px-4 py-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80">
      <div className="flex items-center gap-3">
        <AppLogo />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-400 bg-clip-text text-transparent">
              {brand.name}
            </span>
            <Pill>{brand.badge}</Pill>
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
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
            </span>
            <Radio className="w-3.5 h-3.5" />
            <span>P2P Live</span>
          </div>
        )}

        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="View repository on GitHub"
          className={iconButtonClassName('md', 'dark:hover:text-brand-500')}
        >
          <GitHubIcon />
        </a>

        <IconButton
          onClick={onToggleTheme}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="dark:hover:text-amber-400"
        >
          {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
        </IconButton>

        <IconButton onClick={onOpenSettings} title="Settings (STUN/TURN & Signaling)" className="dark:hover:text-brand-500">
          <Settings className="w-5 h-5" />
        </IconButton>
      </div>
    </header>
  );
};
