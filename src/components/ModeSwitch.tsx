import React from 'react';
import { cn } from '../utils/cn';

export type Mode = 'send' | 'receive';

interface ModeSwitchProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

const LABELS: Record<Mode, string> = {
  send: 'Send Files',
  receive: 'Receive Files',
};

export const ModeSwitch: React.FC<ModeSwitchProps> = ({ mode, onChange }) => (
  <div className="inline-flex p-1 rounded-2xl bg-zinc-200/80 dark:bg-supabase-surface border border-zinc-300/60 dark:border-zinc-800">
    {(['send', 'receive'] as const).map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        className={cn(
          'py-2 px-6 rounded-xl text-sm font-bold transition-[color,background-color,box-shadow]',
          mode === option
            ? 'bg-brand-500 text-supabase-bg shadow-md shadow-brand-500/20'
            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
        )}
      >
        {LABELS[option]}
      </button>
    ))}
  </div>
);
