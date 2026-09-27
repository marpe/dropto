import React from 'react';
import { FilePlus2, Hourglass, KeyRound, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';

export type WaitingStage = 'approval' | 'pin' | 'files' | 'reconnecting';

interface WaitingForSenderCardProps {
  stage: WaitingStage;
  roomCode: string;
  onCancel: () => void;
}

const STAGE_COPY: Record<WaitingStage, { title: string; description: string; icon: LucideIcon }> = {
  approval: {
    title: 'Waiting for the Sender to Accept',
    description: 'The sender has been asked to approve this device. Files appear here as soon as they do.',
    icon: Hourglass,
  },
  files: {
    title: 'Waiting for the Sender’s Files',
    description: 'You are connected. The files appear here as soon as the sender adds them.',
    icon: FilePlus2,
  },
  reconnecting: {
    title: 'Sender Went Offline — Reconnecting…',
    description: 'Their page probably reloaded. This reconnects on its own as soon as they are back.',
    icon: RefreshCw,
  },
  pin: {
    title: 'Checking PIN…',
    description: 'The sender’s device is verifying the PIN you entered.',
    icon: KeyRound,
  },
};

export const WaitingForSenderCard: React.FC<WaitingForSenderCardProps> = ({ stage, roomCode, onCancel }) => {
  const { title, description, icon } = STAGE_COPY[stage];

  return (
    <StatusCard badge={<IconBadge icon={icon} isPulsing />} title={title} description={description}>
      <p className="mb-6">
        <span className="block text-2xs uppercase font-bold tracking-wider text-zinc-400">Room Code</span>
        <span className="font-mono text-lg font-bold tracking-widest text-zinc-800 dark:text-zinc-200">{roomCode}</span>
      </p>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </StatusCard>
  );
};
