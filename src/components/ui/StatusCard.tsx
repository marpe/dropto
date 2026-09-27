import React from 'react';
import { Card } from './Card';
import { cn } from '../../utils/cn';

interface StatusCardProps {
  /** Centred above the title: usually an `IconBadge`, or a spinner */
  badge: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** A full-width state screen: waiting, failed, complete, locked… */
export const StatusCard: React.FC<StatusCardProps> = ({ badge, title, description, children, className }) => (
  <Card className={cn('text-center animate-fade-in', className)}>
    <div className="flex justify-center mb-4">{badge}</div>
    <h2 className="text-xl font-bold text-balance text-zinc-900 dark:text-white mb-2">{title}</h2>
    {description && (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-md mx-auto break-words">{description}</p>
    )}
    {children}
  </Card>
);
