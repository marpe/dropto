import React from 'react';
import { cn } from '../../utils/cn';

/** Ring spinner drawn in the current text colour; size and colour come from className. */
export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin', className)} />
);
