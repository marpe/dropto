import React from 'react';
import { GitHubIcon } from './ui/GitHubIcon';
import { REPOSITORY_URL } from '../constants';
import { getActiveBrand } from '../branding';

export const Footer: React.FC = () => (
  <footer className="w-full max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800/80">
    <div>{getActiveBrand().name} • Browser-only WebRTC P2P Transfer • Files never touch an intermediate server</div>
    <div className="flex items-center gap-4">
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:text-brand-500 transition-colors"
      >
        <GitHubIcon className="w-4 h-4" />
        <span>GitHub (marpe/send)</span>
      </a>
    </div>
  </footer>
);
