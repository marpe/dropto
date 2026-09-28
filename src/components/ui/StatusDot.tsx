import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export type Presence = 'connected' | 'waiting' | 'done' | 'failed';

const PRESENCE: Record<Exclude<Presence, 'done'>, { label: string; colorClass: string; isPulsing: boolean }> = {
  connected: { label: 'Connected', colorClass: 'bg-ctp-green', isPulsing: true },
  waiting: { label: 'Waiting', colorClass: 'bg-ctp-yellow', isPulsing: true },
  failed: { label: 'Disconnected', colorClass: 'bg-ctp-red', isPulsing: false },
};

const DONE_LABEL = 'Finished and left';

interface StatusDotProps {
  presence: Presence;
  className?: string;
}

/**
 * Whether someone is still there, as a small dot; live states pulse. Someone who left after finishing gets a
 * check instead. Its label is the accessible name.
 */
export const StatusDot: React.FC<StatusDotProps> = ({ presence, className }) => {
  if (presence === 'done') {
    return (
      <span role="img" aria-label={DONE_LABEL} title={DONE_LABEL} data-presence={presence} className={cn('inline-flex shrink-0 text-ctp-green', className)}>
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  const { label, colorClass, isPulsing } = PRESENCE[presence];
  return (
    <span role="img" aria-label={label} title={label} data-presence={presence} className={cn('relative inline-flex size-2 shrink-0', className)}>
      {isPulsing && <span className={cn('absolute inset-0 rounded-full opacity-75 motion-safe:animate-ping', colorClass)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', colorClass)} />
    </span>
  );
};
