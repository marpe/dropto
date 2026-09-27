import React from 'react';
import { FilePlus2, Hourglass, KeyRound, Plug, RefreshCw, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';

export type WaitingStage = 'connecting' | 'approval' | 'queued' | 'pin' | 'files' | 'reconnecting';

interface WaitingForSenderCardProps {
  stage: WaitingStage;
  roomCode: string;
  /** While queued: 1 means next */
  queuePosition?: number | null;
  onCancel: () => void;
}

const STAGE_COPY: Record<WaitingStage, { title: string; description: string; icon: LucideIcon }> = {
  connecting: {
    title: 'Connecting to the sender…',
    description: 'Finding a direct route to their device. This usually takes a few seconds.',
    icon: Plug,
  },
  queued: {
    title: 'You’re in line',
    description: 'The sender is busy with others. The files appear here as soon as it’s your turn.',
    icon: Users,
  },
  approval: {
    title: 'Waiting for the sender to accept',
    description: 'The sender has been asked to approve this device. Files appear here as soon as they do.',
    icon: Hourglass,
  },
  files: {
    title: 'Waiting for the sender’s files',
    description: 'You are connected. The files appear here as soon as the sender adds them.',
    icon: FilePlus2,
  },
  reconnecting: {
    title: 'The sender went offline, reconnecting…',
    description: 'Their page probably reloaded. This reconnects on its own as soon as they are back.',
    icon: RefreshCw,
  },
  pin: {
    title: 'Checking the PIN…',
    description: 'The sender’s device is verifying the PIN you entered.',
    icon: KeyRound,
  },
};

function describeQueuePosition(position: number): string {
  const ahead = position - 1;
  if (ahead === 0) {
    return 'You’re next. The files appear here as soon as someone else’s download finishes.';
  }
  return `${ahead === 1 ? '1 person' : `${ahead} people`} ahead of you. The files appear here as soon as it’s your turn.`;
}

export const WaitingForSenderCard: React.FC<WaitingForSenderCardProps> = ({ stage, roomCode, queuePosition = null, onCancel }) => {
  const { title, icon } = STAGE_COPY[stage];
  const description =
    stage === 'queued' && queuePosition ? describeQueuePosition(queuePosition) : STAGE_COPY[stage].description;

  return (
    <StatusCard badge={<IconBadge icon={icon} isPulsing />} title={title} description={description}>
      <p className="mb-6">
        <span className="block text-2xs uppercase font-bold tracking-wider text-text-5">Room code</span>
        <span className="font-mono text-lg font-bold tracking-widest text-text-2">{roomCode}</span>
      </p>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </StatusCard>
  );
};
