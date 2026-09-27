import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

type IconBadgeTone = 'brand' | 'danger' | 'warning';
type IconBadgeSize = 'md' | 'lg';

interface IconBadgeProps {
  icon: LucideIcon;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  /** A ping ring around the badge, for states that are waiting on the other device */
  isPulsing?: boolean;
  className?: string;
  iconClassName?: string;
}

const toneClasses: Record<IconBadgeTone, { badge: string; ping: string }> = {
  brand: { badge: 'bg-brand-500/10 border-brand-500/30 text-brand-500', ping: 'bg-brand-500/20' },
  danger: { badge: 'bg-red-500/10 border-red-500/30 text-red-500', ping: 'bg-red-500/20' },
  warning: { badge: 'bg-amber-500/10 border-amber-500/30 text-amber-500', ping: 'bg-amber-500/20' },
};

const sizeClasses: Record<IconBadgeSize, { box: string; icon: string }> = {
  md: { box: 'w-12 h-12', icon: 'w-6 h-6' },
  lg: { box: 'w-16 h-16', icon: 'w-8 h-8' },
};

export const IconBadge: React.FC<IconBadgeProps> = ({
  icon: Icon,
  tone = 'brand',
  size = 'lg',
  isPulsing = false,
  className,
  iconClassName,
}) => (
  <div className={cn('relative shrink-0', sizeClasses[size].box, className)}>
    {isPulsing && (
      <span className={cn('absolute inset-0 rounded-2xl motion-safe:animate-ping', toneClasses[tone].ping)} />
    )}
    <div
      className={cn(
        'relative w-full h-full rounded-2xl border flex items-center justify-center',
        toneClasses[tone].badge
      )}
    >
      <Icon className={cn(sizeClasses[size].icon, iconClassName)} />
    </div>
  </div>
);
