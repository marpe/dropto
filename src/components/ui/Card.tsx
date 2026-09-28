import React from 'react';
import { cn } from '../../utils/cn';

type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

const paddingClasses: Record<CardPadding, string> = {
  sm: 'p-4 sm:p-5',
  md: 'p-4 sm:p-5',
  lg: 'px-4 py-6 sm:p-6',
};

/**
 * A section of a screen. On a phone: a full-width grouped block with hairlines above and below, like a
 * native list group. On desktop: one part of the utility panel, which draws the frame and the dividers.
 */
export const Card: React.FC<CardProps> = ({ padding = 'lg', className, ...props }) => (
  <div
    className={cn(
      'bg-surface-1 border-y border-border-1 sm:rounded-xl',
      paddingClasses[padding],
      className
    )}
    {...props}
  />
);
