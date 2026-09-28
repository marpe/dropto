import React from 'react';
import { cn } from '../../utils/cn';

export type Presence = 'connected' | 'waiting' | 'gone' | 'failed';

const PRESENCE: Record<Presence, { label: string; colorClass: string; isPulsing: boolean }> = {
  connected: { label: 'Connected', colorClass: 'bg-ctp-green', isPulsing: true },
  waiting: { label: 'Waiting', colorClass: 'bg-ctp-yellow', isPulsing: true },
  gone: { label: 'Left', colorClass: 'bg-text-5', isPulsing: false },
  failed: { label: 'Disconnected', colorClass: 'bg-ctp-red', isPulsing: false },
};

interface StatusDotProps {
  presence: Presence;
  className?: string;
}

/** Whether someone is still there, as a small dot; live states pulse. Its label is the accessible name. */
export const StatusDot: React.FC<StatusDotProps> = ({ presence, className }) => {
  const { label, colorClass, isPulsing } = PRESENCE[presence];
  return (
    <span role="img" aria-label={label} title={label} data-presence={presence} className={cn('relative inline-flex size-2 shrink-0', className)}>
      {isPulsing && <span className={cn('absolute inset-0 rounded-full opacity-75 motion-safe:animate-ping', colorClass)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', colorClass)} />
    </span>
  );
};
