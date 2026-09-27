import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  isWarning?: boolean;
  className?: string;
  'data-testid'?: string;
}

/** One labelled number in a transfer's stats (speed, time, size…). */
export const StatTile: React.FC<StatTileProps> = ({
  icon: Icon,
  label,
  value,
  isWarning = false,
  className,
  'data-testid': testId,
}) => (
  <div
    data-testid={testId}
    className={cn(
      'p-3.5 rounded-xl bg-surface-2 border border-border-1 text-left transition-[border-color,opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1',
      isWarning ? 'hover:border-amber-400/40' : 'hover:border-brand-500/40',
      className
    )}
  >
    <div className="flex items-center gap-2 text-text-4 text-xs mb-1">
      <Icon className={cn('w-3.5 h-3.5', isWarning ? 'text-amber-400' : 'text-brand-500')} />
      <span>{label}</span>
    </div>
    <div data-stat-value className="text-lg sm:text-xl font-semibold tracking-tight tabular-nums text-text-1">
      {value}
    </div>
  </div>
);
