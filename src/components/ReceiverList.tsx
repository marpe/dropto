import React from 'react';
import type { SenderReceiver } from '../types/sharing';
import { ReceiverRow } from './ReceiverRow';

interface ReceiverListProps {
  receivers: SenderReceiver[];
  onStopReceiver: (peerId: string) => void;
  onDismissReceiver: (peerId: string) => void;
}

/** Everyone on a link shared with several people: in line, downloading or done. */
export const ReceiverList: React.FC<ReceiverListProps> = ({ receivers, onStopReceiver, onDismissReceiver }) => {
  const queued = receivers.filter((receiver) => receiver.stage === 'queued');

  return (
    <ul className="divide-y divide-border-1 -my-1">
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
  );
};
