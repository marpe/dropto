import { cn } from '../../utils/cn';

export type IconButtonSize = 'sm' | 'md';

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'p-1.5 rounded-lg',
  md: 'p-2 rounded-xl',
};

/** Shared by icon-only buttons and icon links (e.g. the repository link in the header). */
export function iconButtonClassName(size: IconButtonSize = 'md', className?: string): string {
  return cn(
    'inline-flex items-center justify-center shrink-0 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-[color,background-color,transform] motion-safe:hover:scale-105',
    sizeClasses[size],
    className
  );
}
