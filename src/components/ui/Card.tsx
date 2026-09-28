import React from 'react';
import { cn } from '../../utils/cn';

type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingClasses: Record<CardPadding, string> = {
  sm: 'p-4 sm:p-5',
  md: 'p-4 sm:p-6',
  lg: 'p-5 sm:p-8',
};

/**
 * The raised surface every screen section sits on. On a phone it runs edge to edge (cancelling the page's
 * side padding), so screens feel full-screen rather than like floating boxes.
 */
export const Card: React.FC<CardProps> = ({ padding = 'lg', className, ...props }) => (
  <div
    className={cn(
      'bg-surface-1 border-y border-border-2 -mx-4 sm:mx-0 sm:border-x sm:rounded-3xl sm:shadow-xl',
      paddingClasses[padding],
      className
    )}
    {...props}
  />
);
