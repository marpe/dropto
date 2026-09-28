import React from 'react';
import type { PendingPeer, SenderReceiver } from '../types/sharing';
import { PendingPeerRow } from './PendingPeerRow';
import { ReceiverRow } from './ReceiverRow';

interface ReceiverListProps {
  /** People asking to connect, shown first with Accept and Decline */
  requests: PendingPeer[];
  receivers: SenderReceiver[];
  /** What people with the link wait for before they are let in */
  waitingFor: string;
  onAccept: (peerId: string) => void;
  onDecline: (peerId: string) => void;
  onStopReceiver: (peerId: string) => void;
  onDismissReceiver: (peerId: string) => void;
  onTogglePauseReceiver: (peerId: string) => void;
}

/** Everyone on the link: asking to connect, idle, in line, downloading or gone. */
export const ReceiverList: React.FC<ReceiverListProps> = ({
  requests,
  receivers,
  waitingFor,
  onAccept,
  onDecline,
  onStopReceiver,
  onDismissReceiver,
  onTogglePauseReceiver,
}) => {
  const queued = receivers.filter((receiver) => receiver.stage === 'queued');

  return (
    <ul className="divide-y divide-border-1 -my-1">
      {requests.map((peer) => (
        <PendingPeerRow
          key={peer.peerId}
          peer={peer}
          waitingFor={waitingFor}
          onAccept={() => onAccept(peer.peerId)}
          onDecline={() => onDecline(peer.peerId)}
        />
      ))}
      {receivers.map((receiver) => (
        <ReceiverRow
          key={receiver.peerId}
          receiver={receiver}
          queuePosition={receiver.stage === 'queued' ? queued.indexOf(receiver) + 1 : null}
          onStop={() => onStopReceiver(receiver.peerId)}
          onDismiss={() => onDismissReceiver(receiver.peerId)}
          onTogglePause={() => onTogglePauseReceiver(receiver.peerId)}
        />
      ))}
    </ul>
  );
};
