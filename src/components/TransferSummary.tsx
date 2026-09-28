import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card } from './ui/Card';
import { ProgressBar } from './ui/ProgressBar';
import { Spinner } from './ui/Spinner';
import type { TransferMetrics } from '../types/transfer';
import { fireCelebration } from '../services/confetti';
import { settledMetrics } from '../utils/transferProgress';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { cn } from '../utils/cn';

interface TransferSummaryProps {
  metrics: TransferMetrics | null;
  /** The files of this download, for its totals when it was too quick to report any */
  files: { name: string; size: number }[];
  isPaused: boolean;
  /** Waiting for the sender to free up; 1 means next */
  queuePosition: number | null;
  /** Set once the download finished */
  completion: { corruptedFiles: string[] } | null;
  /** A cut-off download waiting for the sender to be back */
  isReconnecting?: boolean;
}

function describeProgress(metrics: TransferMetrics, isPaused: boolean): string {
  const percent = `${Math.floor(metrics.overallPercent)}%`;
  if (isPaused) {
    return percent;
  }
  return `${percent} · ${formatSpeed(metrics.currentSpeed)} · ${formatDuration(metrics.etaSeconds)} left`;
}

/** One line over the file list: how the download is going, or how it went. Each file shows its own progress. */
export const TransferSummary: React.FC<TransferSummaryProps> = ({
  metrics,
  files,
  isPaused,
  queuePosition,
  completion,
  isReconnecting = false,
}) => {
  const corruptedCount = completion?.corruptedFiles.length ?? 0;
  const isVerified = completion !== null && corruptedCount === 0;

  useEffect(() => {
    // Never celebrate a download that may have produced corrupted files
    if (isVerified) {
      fireCelebration();
    }
  }, [isVerified]);

  let icon: React.ReactNode;
  let title: string;
  let detail = '';
  if (completion) {
    const final = settledMetrics(metrics, files);
    icon = corruptedCount > 0 ? (
      <AlertTriangle className="w-4 h-4 shrink-0 text-text-warning-1 motion-safe:animate-pop-in" />
    ) : (
      <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-500 motion-safe:animate-pop-in" />
    );
    title = corruptedCount > 0 ? `${corruptedCount === 1 ? '1 file' : `${corruptedCount} files`} may be corrupted` : 'Done';
    // Under a second there is no meaningful duration or speed to show
    detail =
      final.elapsedSeconds >= 1
        ? `${formatBytes(final.totalBytes)} in ${formatDuration(final.elapsedSeconds)} · ${formatSpeed(final.averageSpeed)}`
        : formatBytes(final.totalBytes);
  } else if (isReconnecting) {
    icon = <Spinner className="w-4 h-4 border-2 text-text-4" />;
    title = 'Reconnecting…';
  } else if (queuePosition !== null) {
    icon = <Clock className="w-4 h-4 shrink-0 text-text-4" />;
    title = 'In line';
    detail = queuePosition === 1 ? 'You’re next' : `${queuePosition - 1} ahead of you`;
  } else if (!metrics) {
    icon = <Spinner className="w-4 h-4 border-2 text-brand-500" />;
    title = 'Starting…';
  } else {
    icon = (
      <span className="relative flex size-2.5 shrink-0">
        {!isPaused && <span className="absolute inset-0 rounded-full bg-brand-500 opacity-75 motion-safe:animate-ping" />}
        <span className={cn('relative size-2.5 rounded-full', isPaused ? 'bg-text-5' : 'bg-brand-500')} />
      </span>
    );
    title = isPaused ? 'Paused' : 'Receiving';
    detail = describeProgress(metrics, isPaused);
  }

  const percent = completion ? 100 : (metrics?.overallPercent ?? 0);

  return (
    <Card data-testid="transfer-summary" padding="sm" className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="font-semibold text-text-1">{title}</span>
        <span className="ml-auto min-w-0 truncate text-xs text-text-4 tabular-nums">{detail}</span>
      </div>
      <div className="flex items-center gap-3">
        <ProgressBar percent={percent} variant="subtle" className="flex-1" />
        <span data-testid="overall-percent" className="shrink-0 w-9 text-right text-xs font-semibold tabular-nums text-text-2">
          {Math.floor(percent)}%
        </span>
      </div>
    </Card>
  );
};
