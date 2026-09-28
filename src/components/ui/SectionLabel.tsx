import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SectionLabelProps {
  children: React.ReactNode;
  /** A heading where the label heads a section; a span inside a form label */
  as?: 'span' | 'h2' | 'h3' | 'h4';
  icon?: LucideIcon;
  className?: string;
}

/** The small uppercase label over a section or field ("Connections", "Room code"). */
export const SectionLabel: React.FC<SectionLabelProps> = ({ children, as: Tag = 'span', icon: Icon, className }) => (
  <Tag className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-5', className)}>
    {Icon && <Icon className="w-3.5 h-3.5 text-brand-500" />}
    {children}
  </Tag>
);
