import React from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  // The inset highlight gives the fill a little depth without a gradient
  primary:
    'font-semibold bg-accent hover:bg-accent-hover text-text-on-accent shadow-lg shadow-accent/25 hover:shadow-accent/40 inset-ring inset-ring-white/10',
  secondary:
    'font-semibold bg-surface-3 hover:bg-surface-4 text-text-2',
  // Secondary at rest; turns red on hover for Decline / Cancel transfer
  danger:
    'font-semibold bg-surface-3 text-text-3 hover:bg-surface-danger-1 hover:text-text-danger-1',
  ghost: 'font-medium text-text-4 hover:bg-surface-3',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs',
  md: 'gap-2 px-5 py-2.5 text-sm',
  lg: 'gap-2 px-6 py-3.5 text-base',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}) => (
  <button
    type={type}
    className={cn(
      'inline-flex items-center justify-center rounded-xl transition-[transform,background-color,color,box-shadow] duration-150 motion-safe:active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
      variantClasses[variant],
      sizeClasses[size],
      className
    )}
    {...props}
  />
);
