import React from 'react';
import { cn } from '../../utils/cn';

type ProgressBarVariant = 'primary' | 'subtle';

interface ProgressBarProps {
  percent: number;
  variant?: ProgressBarVariant;
  className?: string;
}

const trackClasses: Record<ProgressBarVariant, string> = {
  primary: 'h-3 p-0.5 border border-zinc-200 dark:border-zinc-800',
  subtle: 'h-1.5',
};

const fillClasses: Record<ProgressBarVariant, string> = {
  primary: 'bg-linear-to-r from-brand-600 via-brand-500 to-brand-400 shadow-[0_0_12px] shadow-brand-500/40',
  subtle: 'bg-brand-500/60',
};

/** Animates `transform` rather than `width` so progress updates never trigger layout. */
export const ProgressBar: React.FC<ProgressBarProps> = ({ percent, variant = 'primary', className }) => {
  const fraction = Math.min(Math.max(percent, 0), 100) / 100;
  return (
    <div className={cn('w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden', trackClasses[variant], className)}>
      <div
        className={cn('h-full rounded-full origin-left transition-transform duration-300 ease-out', fillClasses[variant])}
        style={{ transform: `scaleX(${fraction})` }}
      />
    </div>
  );
};
