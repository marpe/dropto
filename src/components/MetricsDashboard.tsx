import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Files, Gauge, HardDrive, Pause, Play, Timer, TrendingUp, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProgressRing } from './ui/ProgressRing';
import { StatTile } from './ui/StatTile';
import type { ManifestFile, TransferMetrics } from '../types/transfer';
import { getFileProgress } from '../utils/transferProgress';
import { TransferFileList } from './TransferFileList';
import { fireCelebration } from '../services/confetti';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { cn } from '../utils/cn';

interface TransferCompletion {
  /** Paths of files whose checksum did not match; any entry turns the result into a warning */
  corruptedFiles: string[];
  /** What to do next, in place of Pause / Cancel */
  actions: React.ReactNode;
}

interface MetricsDashboardProps {
  metrics: TransferMetrics;
  /** Every file in the transfer, listed with its progress (and, once done, how long it took) */
  files: ManifestFile[];
  isSender: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
  /** Once the transfer is done it stays on screen with its final numbers */
  completion?: TransferCompletion;
}

function describeResult(isSender: boolean, completion: TransferCompletion) {
  const count = completion.corruptedFiles.length;
  if (count > 0) {
    return {
      title: 'Finished with errors',
      detail: `${count === 1 ? '1 file' : `${count} files`} failed the integrity check and may be corrupted.`,
      icon: AlertTriangle,
      tone: 'text-text-warning-1',
    };
  }
  return { title: isSender ? 'Sent' : 'Download complete', detail: 'Every file arrived intact.', icon: CheckCircle2, tone: 'text-brand-500' };
}

/** A transfer from start to finish: overall progress as a ring, the numbers beside it, and each file below. */
export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  files,
  isSender,
  isPaused,
  onTogglePause,
  onCancel,
  completion,
}) => {
  const result = completion ? describeResult(isSender, completion) : null;
  const isVerified = completion !== undefined && completion.corruptedFiles.length === 0;
  const percent = completion ? 100 : Math.min(Math.floor(metrics.overallPercent), 100);
  const totalBytes = completion ? files.reduce((sum, file) => sum + file.size, 0) : metrics.totalBytes;

  useEffect(() => {
    // Never celebrate a transfer that may have produced corrupted files
    if (isVerified) {
      fireCelebration();
    }
  }, [isVerified]);

  return (
    <Card padding="md" className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-text-1">
            {result ? (
              <result.icon className={cn('w-4 h-4 shrink-0 motion-safe:animate-pop-in', result.tone)} />
            ) : (
              <span className="relative flex size-2.5 shrink-0">
                {!isPaused && <span className="absolute inset-0 rounded-full bg-brand-500 opacity-75 motion-safe:animate-ping" />}
                <span className={cn('relative size-2.5 rounded-full', isPaused ? 'bg-text-5' : 'bg-brand-500')} />
              </span>
            )}
            {result ? result.title : isPaused ? 'Paused' : isSender ? 'Sending' : 'Receiving'}
          </p>
          <p className="text-xs text-text-4 truncate mt-0.5">
            {result
              ? result.detail
              : `${files.length > 1 ? `File ${metrics.currentFileIndex + 1} of ${metrics.totalFiles} · ` : ''}${metrics.currentFileName}`}
          </p>
        </div>

        {!completion && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onTogglePause}>
              {isPaused ? <Play className="w-3.5 h-3.5 text-brand-500" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </Button>
            <Button variant="danger" size="sm" onClick={onCancel}>
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 my-6">
        <ProgressRing percent={percent} isIdle={isPaused && !completion}>
          <span data-testid="overall-percent" className="block text-4xl font-bold tracking-tight tabular-nums text-text-1">
            {percent}
            <span className="text-lg text-text-4">%</span>
          </span>
          <span className="block text-2xs text-text-5 tabular-nums">
            {formatBytes(completion ? totalBytes : metrics.bytesTransferred)} of {formatBytes(totalBytes)}
          </span>
        </ProgressRing>

        {completion ? (
          <div className="grid grid-cols-2 gap-3 w-full flex-1">
            <StatTile data-testid="stat-files" icon={Files} label="Files" value={String(files.length)} />
            <StatTile data-testid="stat-size" icon={HardDrive} label="Size" value={formatBytes(totalBytes)} />
            {/* Under a second there is no meaningful duration or speed to show */}
            {metrics.elapsedSeconds >= 1 && (
              <>
                <StatTile data-testid="stat-time" icon={Timer} label="Time taken" value={formatDuration(metrics.elapsedSeconds)} />
                <StatTile data-testid="stat-speed" icon={TrendingUp} label="Average speed" value={formatSpeed(metrics.averageSpeed)} />
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full flex-1">
            <StatTile icon={Gauge} label="Speed" value={isPaused ? '—' : formatSpeed(metrics.currentSpeed)} />
            <StatTile icon={Clock} label="Time left" value={isPaused ? '—' : formatDuration(metrics.etaSeconds)} isWarning />
            {/* On a phone the two numbers above are what matters */}
            <StatTile
              icon={Timer}
              label="Elapsed"
              value={metrics.elapsedSeconds > 0 ? formatDuration(metrics.elapsedSeconds) : '—'}
              className="hidden sm:block"
            />
            <StatTile icon={TrendingUp} label="Average" value={formatSpeed(metrics.averageSpeed)} className="hidden sm:block" />
          </div>
        )}
      </div>

      <TransferFileList
        files={files}
        progress={getFileProgress(files, metrics, completion?.corruptedFiles ?? [], completion !== undefined)}
        className="pt-4 border-t border-border-1"
      />

      {completion && <div className="flex flex-wrap justify-center gap-3 mt-6">{completion.actions}</div>}
    </Card>
  );
};
