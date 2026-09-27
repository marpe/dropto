import React from 'react';
import { cn } from '../../utils/cn';

interface ProgressRingProps {
  percent: number;
  /** Dims the ring and stops its glow, e.g. while paused */
  isIdle?: boolean;
  /** Shown in the middle, usually the percentage */
  children?: React.ReactNode;
  className?: string;
}

// pathLength="100" lets the dash offset be the remaining percent, whatever the radius
const RADIUS = 44;

/** A circular progress indicator; the arc eases towards each new value. */
export const ProgressRing: React.FC<ProgressRingProps> = ({ percent, isIdle = false, children, className }) => {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className={cn('relative grid place-items-center size-36 shrink-0', className)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={RADIUS} pathLength="100" className="fill-none stroke-surface-3" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          pathLength="100"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset={100 - clamped}
          className={cn(
            // A round cap would still draw a dot at 0%
            'fill-none transition-[stroke-dashoffset,stroke,opacity] duration-500 ease-out',
            clamped === 0 && 'opacity-0',
            isIdle ? 'stroke-text-5' : 'stroke-brand-500'
          )}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
};
