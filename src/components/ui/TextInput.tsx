import React from 'react';
import { cn } from '../../utils/cn';

type TextInputSize = 'sm' | 'lg';

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** `lg` is the centred, monospaced style for codes and PINs */
  size?: TextInputSize;
}

const sizeClasses: Record<TextInputSize, string> = {
  sm: 'px-3 py-1.5 rounded-lg text-xs bg-surface-1 text-text-2',
  lg: 'py-3 px-4 rounded-xl text-center font-mono text-xl tracking-widest bg-surface-2 text-text-1 focus:ring-2 focus:ring-brand-500/50',
};

export const TextInput: React.FC<TextInputProps> = ({ size = 'sm', type = 'text', className, ...props }) => (
  <input
    type={type}
    className={cn(
      'w-full min-w-0 border border-border-3 focus:border-brand-500 focus:outline-hidden transition-[border-color,box-shadow]',
      sizeClasses[size],
      className
    )}
    {...props}
  />
);
