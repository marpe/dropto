import React from 'react';
import { cn } from '../../utils/cn';

interface PillProps {
  children: React.ReactNode;
  className?: string;
}

/** A small uppercase brand-tinted tag (brand badge, live status). */
export const Pill: React.FC<PillProps> = ({ children, className }) => (
  <span
    className={cn(
      'text-2xs font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 border border-brand-500/30',
      className
    )}
  >
    {children}
  </span>
);
