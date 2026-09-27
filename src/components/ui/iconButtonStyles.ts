import { cn } from '../../utils/cn';

export type IconButtonSize = 'sm' | 'md';

const sizeClasses: Record<IconButtonSize, string> = {
  // Fingers need a bigger target than a mouse pointer; the icon stays the same size
  sm: 'p-1.5 rounded-lg pointer-coarse:p-2.5',
  md: 'p-2 rounded-xl',
};

/** Shared by icon-only buttons and icon links (e.g. the repository link in the header). */
export function iconButtonClassName(size: IconButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex items-center justify-center shrink-0 text-text-4 hover:text-text-1 hover:bg-surface-3 transition-[color,background-color,transform] motion-safe:hover:scale-105',
    sizeClasses[size],
    className
  );
}
