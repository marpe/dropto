import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

type NoticeTone = 'brand' | 'warning' | 'danger';

interface NoticeProps {
  tone: NoticeTone;
  icon: LucideIcon;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const toneClasses: Record<NoticeTone, { box: string; icon: string }> = {
  brand: { box: 'bg-brand-500/10 border-brand-500/20', icon: 'text-brand-500' },
  warning: { box: 'bg-amber-500/10 border-amber-500/30', icon: 'text-amber-500' },
  danger: { box: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60', icon: 'text-red-500' },
};

/** An inline callout: information, a caveat or an error, next to the thing it is about. */
export const Notice: React.FC<NoticeProps> = ({ tone, icon: Icon, title, children, className }) => (
  <div className={cn('flex items-start gap-3 p-3.5 rounded-xl border text-xs', toneClasses[tone].box, className)}>
    <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', toneClasses[tone].icon)} />
    <div
      className={cn(
        'min-w-0 break-words',
        tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'
      )}
    >
      {title && <span className="font-semibold block text-zinc-900 dark:text-white">{title}</span>}
      {children}
    </div>
  </div>
);
