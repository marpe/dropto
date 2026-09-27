import React from 'react';
import type { SenderReceiver } from '../types/sharing';
import { countActiveReceivers } from '../hooks/senderState';
import { ReceiverRow } from './ReceiverRow';

interface ShareActivityProps {
  receivers: SenderReceiver[];
  /** Listing people only makes sense when several may download; one person gets the full-screen view */
  isListed: boolean;
  onStopReceiver: (peerId: string) => void;
  onDismissReceiver: (peerId: string) => void;
}

/** What is happening on the link: a live "waiting" line until someone arrives, then everyone's progress. */
export const ShareActivity: React.FC<ShareActivityProps> = ({ receivers, isListed, onStopReceiver, onDismissReceiver }) => {
  if (!isListed || receivers.length === 0) {
    return (
      <p data-testid="share-waiting" className="flex items-center justify-center gap-2 text-xs text-text-4">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-brand-500/60 motion-safe:animate-ping" />
          <span className="relative w-2 h-2 rounded-full bg-brand-500" />
        </span>
        Waiting for someone to open the link…
      </p>
    );
  }

  const queued = receivers.filter((receiver) => receiver.stage === 'queued');
  const active = countActiveReceivers(receivers);
  const done = receivers.filter((receiver) => receiver.stage === 'completed').length;

  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold text-text-3 tabular-nums">
        {[`${active} downloading`, queued.length > 0 ? `${queued.length} waiting` : null, done > 0 ? `${done} done` : null]
          .filter(Boolean)
          .join(' · ')}
      </h3>
      <ul className="divide-y divide-border-1">
        {receivers.map((receiver) => (
          <ReceiverRow
            key={receiver.peerId}
            receiver={receiver}
            queuePosition={receiver.stage === 'queued' ? queued.indexOf(receiver) + 1 : null}
            onStop={() => onStopReceiver(receiver.peerId)}
            onDismiss={() => onDismissReceiver(receiver.peerId)}
          />
        ))}
      </ul>
    </section>
  );
};
