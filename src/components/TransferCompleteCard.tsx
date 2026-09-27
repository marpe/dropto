import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { StatusCard } from './ui/StatusCard';
import { TransferFileList } from './TransferFileList';
import { fireCelebration } from '../services/confetti';
import type { ManifestFile, TransferMetrics } from '../types/transfer';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { getFileProgress } from '../utils/transferProgress';

interface TransferCompleteCardProps {
  title: string;
  actionLabel: string;
  onAction: () => void;
  files: ManifestFile[];
  /** The final snapshot, for timing; null when the transfer finished before one was taken */
  metrics: TransferMetrics | null;
  /** Paths of files whose checksum did not match; any entry turns the card into a warning */
  corruptedFiles: string[];
}

function summarise(files: ManifestFile[], metrics: TransferMetrics | null): string {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const parts = [`${files.length} ${files.length === 1 ? 'file' : 'files'}`, formatBytes(totalBytes)];
  if (metrics && metrics.elapsedSeconds >= 1) {
    parts.push(formatDuration(metrics.elapsedSeconds), `${formatSpeed(metrics.averageSpeed)} average`);
  }
  return parts.join(' · ');
}

export const TransferCompleteCard: React.FC<TransferCompleteCardProps> = ({
  title,
  actionLabel,
  onAction,
  files,
  metrics,
  corruptedFiles,
}) => {
  const isVerified = corruptedFiles.length === 0;

  useEffect(() => {
    // Never celebrate a transfer that may have produced corrupted files
    if (isVerified) {
      fireCelebration();
    }
  }, [isVerified]);

  const fileList = files.length > 1 || !isVerified ? (
    <TransferFileList files={files} progress={getFileProgress(files, metrics, corruptedFiles, true)} className="mb-6" />
  ) : null;
  const action = (
    <Button onClick={onAction} className="px-6">
      {actionLabel}
    </Button>
  );

  if (isVerified) {
    return (
      <StatusCard
        badge={<IconBadge icon={CheckCircle2} className="motion-safe:animate-bounce" />}
        title={title}
        description={summarise(files, metrics)}
      >
        {fileList}
        {action}
      </StatusCard>
    );
  }

  const count = corruptedFiles.length;
  return (
    <StatusCard
      badge={<IconBadge icon={AlertTriangle} tone="warning" />}
      title="Transfer Finished With Errors"
      description={`${count === 1 ? '1 file' : `${count} files`} failed the integrity check and may be corrupted. Send ${count === 1 ? 'it' : 'them'} again.`}
    >
      {fileList}
      {action}
    </StatusCard>
  );
};
