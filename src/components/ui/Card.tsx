import React from 'react';
import { cn } from '../../utils/cn';

type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingClasses: Record<CardPadding, string> = {
  sm: 'p-5',
  md: 'p-6',
  lg: 'p-8',
};

/** The raised surface every screen section sits on. */
export const Card: React.FC<CardProps> = ({ padding = 'lg', className, ...props }) => (
  <div
    className={cn(
      'rounded-3xl bg-surface-1 border border-border-2 shadow-xl',
      paddingClasses[padding],
      className
    )}
    {...props}
  />
);
