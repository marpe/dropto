import React from 'react';
import { Hourglass, KeyRound } from 'lucide-react';
import { Button } from './ui/Button';

type WaitingStage = 'approval' | 'pin';

interface WaitingForSenderCardProps {
  stage: WaitingStage;
  roomCode: string;
  onCancel: () => void;
}

const STAGE_COPY: Record<WaitingStage, { title: string; description: string; Icon: typeof Hourglass }> = {
  approval: {
    title: 'Waiting for the Sender to Accept',
    description: 'The sender has been asked to approve this device. Files appear here as soon as they do.',
    Icon: Hourglass,
  },
  pin: {
    title: 'Checking PIN…',
    description: 'The sender’s device is verifying the PIN you entered.',
    Icon: KeyRound,
  },
};

export const WaitingForSenderCard: React.FC<WaitingForSenderCardProps> = ({ stage, roomCode, onCancel }) => {
  const { title, description, Icon } = STAGE_COPY[stage];

  return (
    <div className="rounded-3xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl text-center animate-fade-in">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <span className="absolute inset-0 rounded-2xl bg-brand-500/20 motion-safe:animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 flex items-center justify-center">
          <Icon className="w-8 h-8" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-balance text-zinc-900 dark:text-white mb-2">{title}</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 max-w-sm mx-auto">{description}</p>
      <p className="mb-6">
        <span className="block text-2xs uppercase font-bold tracking-wider text-zinc-400">Room Code</span>
        <span className="font-mono text-lg font-bold tracking-widest text-zinc-800 dark:text-zinc-200">{roomCode}</span>
      </p>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
};
