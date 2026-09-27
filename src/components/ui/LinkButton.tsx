import React from 'react';
import { cn } from '../../utils/cn';

type LinkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** A quiet text action for secondary navigation, e.g. "Got a code? Receive files". */
export const LinkButton: React.FC<LinkButtonProps> = ({ type = 'button', className, ...props }) => (
  <button
    type={type}
    className={cn(
      'inline-flex items-center gap-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-brand-500 dark:hover:text-brand-500 transition-colors',
      className
    )}
    {...props}
  />
);
