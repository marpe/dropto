import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';
import { fireCelebration } from '../services/confetti';

interface TransferCompleteCardProps {
  successTitle: string;
  successDescription: string;
  actionLabel: string;
  onAction: () => void;
  /** Paths of files whose checksum did not match; any entry turns the card into a warning */
  corruptedFiles: string[];
}

export const TransferCompleteCard: React.FC<TransferCompleteCardProps> = ({
  successTitle,
  successDescription,
  actionLabel,
  onAction,
  corruptedFiles,
}) => {
  const isVerified = corruptedFiles.length === 0;

  useEffect(() => {
    // Never celebrate a transfer that may have produced corrupted files
    if (isVerified) {
      fireCelebration();
    }
  }, [isVerified]);

  const action = (
    <Button onClick={onAction} className="px-6">
      {actionLabel}
    </Button>
  );

  if (isVerified) {
    return (
      <StatusCard
        badge={<IconBadge icon={CheckCircle2} className="motion-safe:animate-bounce" />}
        title={successTitle}
        description={successDescription}
      >
        {action}
      </StatusCard>
    );
  }

  const count = corruptedFiles.length;
  return (
    <StatusCard
      badge={<IconBadge icon={AlertTriangle} tone="warning" />}
      title="Transfer Finished With Errors"
      description={`${count === 1 ? '1 file' : `${count} files`} failed the integrity check and may be corrupted. Send ${count === 1 ? 'it' : 'them'} again:`}
    >
      <ul className="max-h-40 overflow-y-auto mb-6 space-y-1 text-left text-xs font-mono">
        {corruptedFiles.map((path) => (
          <li
            key={path}
            className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 break-all"
          >
            {path}
          </li>
        ))}
      </ul>
      {action}
    </StatusCard>
  );
};
