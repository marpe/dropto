import React from 'react';
import { FilePlus2, Hourglass, KeyRound, Plug, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';

export type WaitingStage = 'connecting' | 'approval' | 'pin' | 'files' | 'reconnecting';

interface WaitingForSenderCardProps {
  stage: WaitingStage;
  roomCode: string;
  onCancel: () => void;
}

const STAGE_COPY: Record<WaitingStage, { title: string; description: string; icon: LucideIcon }> = {
  connecting: {
    title: 'Connecting to the sender…',
    description: 'Usually takes a few seconds.',
    icon: Plug,
  },
  approval: {
    title: 'Waiting for the sender to accept',
    description: 'Files appear once they accept.',
    icon: Hourglass,
  },
  files: {
    title: 'Waiting for the sender’s files',
    description: 'Connected. Files appear once added.',
    icon: FilePlus2,
  },
  reconnecting: {
    title: 'The sender went offline, reconnecting…',
    description: 'Reconnects when they’re back.',
    icon: RefreshCw,
  },
  pin: {
    title: 'Checking the PIN…',
    description: 'Waiting for the sender.',
    icon: KeyRound,
  },
};

export const WaitingForSenderCard: React.FC<WaitingForSenderCardProps> = ({ stage, roomCode, onCancel }) => {
  const { title, description, icon } = STAGE_COPY[stage];

  return (
    <StatusCard badge={<IconBadge icon={icon} isPulsing />} title={title} description={description}>
      <p className="mb-6 text-xs text-text-5">
        Room <span className="font-mono font-semibold tracking-wider text-text-3">{roomCode}</span>
      </p>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </StatusCard>
  );
};
