import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, FolderOpen, Pause, UserRound, X } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { IconButton } from './ui/IconButton';
import { ProgressBar } from './ui/ProgressBar';
import type { SenderReceiver } from '../types/sharing';
import { cn } from '../utils/cn';
import { formatSpeed } from '../utils/format';

interface ReceiverRowProps {
  receiver: SenderReceiver;
  /** Place in line (1 = next) while queued */
  queuePosition: number | null;
  onStop: () => void;
  onDismiss: () => void;
}

function describeStage(receiver: SenderReceiver, queuePosition: number | null): string {
  switch (receiver.stage) {
    case 'queued':
      return queuePosition === 1 ? 'Next in line' : `In line · #${queuePosition ?? '?'}`;
    case 'choosing':
      return 'Choosing where to save';
    case 'transferring': {
      if (receiver.isPaused) {
        return 'Paused';
      }
      const metrics = receiver.metrics;
      return metrics ? `${Math.floor(metrics.overallPercent)}% · ${formatSpeed(metrics.currentSpeed)}` : 'Starting…';
    }
    case 'completed': {
      const count = receiver.corruptedFiles.length;
      return count === 0 ? 'Done' : `Done · ${count === 1 ? '1 file' : `${count} files`} may be corrupted`;
    }
    case 'failed':
      return receiver.error ?? 'Failed';
  }
}

const STAGE_ICONS = {
  queued: Clock,
  choosing: FolderOpen,
  transferring: UserRound,
  completed: CheckCircle2,
  failed: AlertCircle,
} as const;

const STAGE_TONES = {
  queued: 'text-text-5',
  choosing: 'text-brand-500',
  transferring: 'text-brand-500',
  completed: 'text-brand-500',
  failed: 'text-text-danger-1',
} as const;

/** One person on a link shared with several people: where they are, and a way to stop them. */
export const ReceiverRow: React.FC<ReceiverRowProps> = ({ receiver, queuePosition, onStop, onDismiss }) => {
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const name = `Person ${receiver.number}`;
  const isFinished = receiver.stage === 'completed' || receiver.stage === 'failed';
  const Icon = receiver.isPaused ? Pause : STAGE_ICONS[receiver.stage];

  return (
    <li data-testid="receiver-row" data-stage={receiver.stage} className="flex items-center gap-3 py-2.5">
      <Icon className={cn('w-4 h-4 shrink-0', STAGE_TONES[receiver.stage])} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-text-2">{name}</span>
          <span className="text-xs text-text-4 tabular-nums truncate">{describeStage(receiver, queuePosition)}</span>
        </div>
        {receiver.stage === 'transferring' && (
          <ProgressBar percent={receiver.metrics?.overallPercent ?? 0} variant="subtle" />
        )}
      </div>
      {isFinished ? (
        <IconButton title="Remove from list" size="sm" onClick={onDismiss}>
          <X className="w-4 h-4" />
        </IconButton>
      ) : (
        <IconButton title={`Stop ${name}`} size="sm" onClick={() => setIsConfirmingStop(true)}>
          <X className="w-4 h-4" />
        </IconButton>
      )}

      {isConfirmingStop && (
        <ConfirmDialog
          title={receiver.stage === 'queued' ? `Take ${name} out of the line?` : `Stop ${name}’s download?`}
          confirmLabel="Stop"
          tone="danger"
          onConfirm={() => {
            setIsConfirmingStop(false);
            onStop();
          }}
          onCancel={() => setIsConfirmingStop(false)}
        >
          <p>They are disconnected. With the link they can come back and start again.</p>
        </ConfirmDialog>
      )}
    </li>
  );
};
