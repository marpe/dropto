import React from 'react';
import { cn } from '../../utils/cn';

interface AppLogoProps {
  className?: string;
}

/** The upload-arrow mark in a glowing tile; tinted by the active brand. */
export const AppLogo: React.FC<AppLogoProps> = ({ className }) => (
  <div
    className={cn(
      'group relative w-10 h-10 rounded-xl bg-zinc-900 border border-brand-500/40 flex items-center justify-center shadow-lg shadow-brand-500/15 hover:border-brand-500 transition-colors',
      className
    )}
  >
    <div className="absolute inset-0 bg-brand-500/10 rounded-xl blur-sm group-hover:bg-brand-500/20 transition-colors" />
    <svg className="w-5 h-5 text-brand-500 relative" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4M17 9l-5-5-5 5M12 4v12" />
    </svg>
  </div>
);
