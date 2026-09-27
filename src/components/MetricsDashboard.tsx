import React from 'react';
import { Clock, Gauge, Pause, Play, Timer, TrendingUp, XCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProgressRing } from './ui/ProgressRing';
import { StatTile } from './ui/StatTile';
import type { ManifestFile, TransferMetrics } from '../types/transfer';
import { getFileProgress } from '../utils/transferProgress';
import { TransferFileList } from './TransferFileList';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { cn } from '../utils/cn';

interface MetricsDashboardProps {
  metrics: TransferMetrics;
  /** Listed with per-file progress when there is more than one */
  files: ManifestFile[];
  isSender: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
}

/** The live transfer: overall progress as a ring, the numbers beside it, and each file below. */
export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  files,
  isSender,
  isPaused,
  onTogglePause,
  onCancel,
}) => {
  const percent = Math.min(Math.floor(metrics.overallPercent), 100);
  const isMultiFile = files.length > 1;

  return (
    <Card padding="md" className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold text-text-1">
            <span className="relative flex size-2.5 shrink-0">
              {!isPaused && <span className="absolute inset-0 rounded-full bg-brand-500 opacity-75 motion-safe:animate-ping" />}
              <span className={cn('relative size-2.5 rounded-full', isPaused ? 'bg-text-5' : 'bg-brand-500')} />
            </span>
            {isPaused ? 'Paused' : isSender ? 'Sending' : 'Receiving'}
          </p>
          <p className="text-xs text-text-4 truncate mt-0.5">
            {isMultiFile && `File ${metrics.currentFileIndex + 1} of ${metrics.totalFiles} · `}
            {metrics.currentFileName}
          </p>
        </div>

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
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 my-6">
        <ProgressRing percent={metrics.overallPercent} isIdle={isPaused}>
          <span data-testid="overall-percent" className="block text-4xl font-bold tracking-tight tabular-nums text-text-1">
            {percent}
            <span className="text-lg text-text-4">%</span>
          </span>
          <span className="block text-2xs text-text-5 tabular-nums">
            {formatBytes(metrics.bytesTransferred)} of {formatBytes(metrics.totalBytes)}
          </span>
        </ProgressRing>

        <div className="grid grid-cols-2 gap-3 w-full flex-1">
          <StatTile icon={Gauge} label="Speed" value={isPaused ? '—' : formatSpeed(metrics.currentSpeed)} />
          <StatTile icon={Clock} label="Time left" value={isPaused ? '—' : formatDuration(metrics.etaSeconds)} isWarning />
          {/* On a phone the two numbers above are what matters */}
          <StatTile icon={Timer} label="Elapsed" value={metrics.elapsedSeconds > 0 ? formatDuration(metrics.elapsedSeconds) : '—'} className="hidden sm:block" />
          <StatTile icon={TrendingUp} label="Average" value={formatSpeed(metrics.averageSpeed)} className="hidden sm:block" />
        </div>
      </div>

      {isMultiFile && (
        <TransferFileList
          files={files}
          progress={getFileProgress(files, metrics, [], false)}
          className="pt-4 border-t border-border-1"
        />
      )}
    </Card>
  );
};
