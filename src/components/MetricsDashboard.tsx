import React from 'react';
import { Gauge, HardDrive, Clock, CheckCircle2, Pause, Play, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Pill } from './ui/Pill';
import { ProgressBar } from './ui/ProgressBar';
import type { ManifestFile, TransferMetrics } from '../types/transfer';
import { getFileProgress } from '../utils/transferProgress';
import { TransferFileList } from './TransferFileList';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { cn } from '../utils/cn';
import { AnimatedWave } from './AnimatedWave';

interface MetricsDashboardProps {
  metrics: TransferMetrics;
  /** Listed with per-file progress when there is more than one */
  files: ManifestFile[];
  isSender: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
}

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  isWarning?: boolean;
}

const StatTile: React.FC<StatTileProps> = ({ icon: Icon, label, value, isWarning = false }) => (
  <div
    className={cn(
      'p-3.5 rounded-xl bg-surface-2 border border-border-1 transition-colors',
      isWarning ? 'hover:border-amber-400/40' : 'hover:border-brand-500/40'
    )}
  >
    <div className="flex items-center gap-2 text-text-4 text-xs mb-1">
      <Icon className={cn('w-3.5 h-3.5', isWarning ? 'text-amber-400' : 'text-brand-500')} />
      <span>{label}</span>
    </div>
    <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-text-1">{value}</div>
  </div>
);

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  files,
  isSender,
  isPaused,
  onTogglePause,
  onCancel,
}) => {
  const percentRounded = Math.min(Math.round(metrics.overallPercent), 100);
  const filePercentRounded = Math.round(metrics.currentFilePercent);

  return (
    <Card padding="md" className="w-full relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-border-1">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex h-3 w-3 shrink-0">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-text-1 flex items-center gap-2">
              <span>{isSender ? 'Streaming to Receiver' : 'Receiving Direct to Disk'}</span>
              <Pill>Active P2P</Pill>
            </h3>
            <p className="text-xs text-text-4 truncate">
              File {metrics.currentFileIndex + 1} of {metrics.totalFiles} • {metrics.currentFileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onTogglePause}>
            {isPaused ? <Play className="w-3.5 h-3.5 text-brand-500" /> : <Pause className="w-3.5 h-3.5 text-amber-500" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </Button>
          <Button variant="danger" size="sm" onClick={onCancel}>
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </Button>
        </div>
      </div>

      <div className="my-5">
        <AnimatedWave active={!isPaused} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <StatTile icon={Gauge} label="Current Speed" value={formatSpeed(metrics.currentSpeed)} />
        <StatTile icon={Clock} label="ETA Remaining" value={formatDuration(metrics.etaSeconds)} isWarning />
        <StatTile icon={HardDrive} label="Transferred" value={formatBytes(metrics.bytesTransferred)} />
        <StatTile icon={CheckCircle2} label="Total Target" value={formatBytes(metrics.totalBytes)} />
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
            <span className="text-text-3">Total Transfer Progress</span>
            <span className="font-mono tabular-nums text-brand-500 font-bold">{percentRounded}%</span>
          </div>
          <ProgressBar percent={percentRounded} />
        </div>

        <div>
          <div className="flex justify-between items-center gap-3 text-xs text-text-4 mb-1.5">
            <span className="min-w-0 truncate">Current File: {metrics.currentFileName}</span>
            <span className="font-mono tabular-nums">{filePercentRounded}%</span>
          </div>
          <ProgressBar percent={filePercentRounded} variant="subtle" />
        </div>
      </div>

      {files.length > 1 && (
        <TransferFileList
          files={files}
          progress={getFileProgress(files, metrics, [], false)}
          className="mt-5 pt-4 border-t border-border-1"
        />
      )}
    </Card>
  );
};
