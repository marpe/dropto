import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Files, Gauge, HardDrive } from 'lucide-react';
import { IconBadge } from './ui/IconBadge';
import { StatTile } from './ui/StatTile';
import { StatusCard } from './ui/StatusCard';
import { TransferFileList } from './TransferFileList';
import { fireCelebration } from '../services/confetti';
import type { ManifestFile, TransferMetrics } from '../types/transfer';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { getFileProgress } from '../utils/transferProgress';

interface TransferCompleteCardProps {
  title: string;
  /** What to do next; buttons laid out in a row that wraps */
  actions: React.ReactNode;
  files: ManifestFile[];
  /** The final snapshot, for timing; null when the transfer finished before one was taken */
  metrics: TransferMetrics | null;
  /** Paths of files whose checksum did not match; any entry turns the card into a warning */
  corruptedFiles: string[];
}

interface TransferStatsProps {
  files: ManifestFile[];
  metrics: TransferMetrics | null;
}

/** What the transfer came to, kept on screen once it is over. */
const TransferStats: React.FC<TransferStatsProps> = ({ files, metrics }) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  // Under a second there is no meaningful duration or speed to show
  const hasTiming = metrics !== null && metrics.elapsedSeconds >= 1;

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <StatTile data-testid="stat-files" icon={Files} label="Files" value={String(files.length)} />
      <StatTile data-testid="stat-size" icon={HardDrive} label="Size" value={formatBytes(totalBytes)} />
      {hasTiming && (
        <>
          <StatTile data-testid="stat-time" icon={Clock} label="Time taken" value={formatDuration(metrics.elapsedSeconds)} />
          <StatTile data-testid="stat-speed" icon={Gauge} label="Average speed" value={formatSpeed(metrics.averageSpeed)} />
        </>
      )}
    </div>
  );
};

export const TransferCompleteCard: React.FC<TransferCompleteCardProps> = ({
  title,
  actions,
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
  const stats = <TransferStats files={files} metrics={metrics} />;
  const action = <div className="flex flex-wrap justify-center gap-3">{actions}</div>;

  if (isVerified) {
    return (
      <StatusCard
        badge={<IconBadge icon={CheckCircle2} className="motion-safe:animate-pop-in" />}
        title={title}
      >
        {stats}
        {fileList}
        {action}
      </StatusCard>
    );
  }

  const count = corruptedFiles.length;
  return (
    <StatusCard
      badge={<IconBadge icon={AlertTriangle} tone="warning" />}
      title="Finished with errors"
      description={`${count === 1 ? '1 file' : `${count} files`} failed the integrity check and may be corrupted. Send ${count === 1 ? 'it' : 'them'} again.`}
    >
      {stats}
      {fileList}
      {action}
    </StatusCard>
  );
};
