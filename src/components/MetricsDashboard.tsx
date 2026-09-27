import React from 'react';
import { Gauge, HardDrive, Clock, CheckCircle2, Pause, Play, XCircle } from 'lucide-react';
import type { TransferMetrics } from '../types/transfer';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';

interface MetricsDashboardProps {
  metrics: TransferMetrics;
  isSender: boolean;
  isPaused: boolean;
  onTogglePause: () => void;
  onCancel: () => void;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  metrics,
  isSender,
  isPaused,
  onTogglePause,
  onCancel,
}) => {
  const percentRounded = Math.min(Math.round(metrics.overallPercent), 100);

  return (
    <div className="w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative overflow-hidden">
      {/* Background ambient gradient */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top row: Status & Actions */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isSender ? 'Streaming to Receiver' : 'Receiving Direct to Disk'}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                Active P2P
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              File {metrics.currentFileIndex + 1} of {metrics.totalFiles} • {metrics.currentFileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-500" /> : <Pause className="w-3.5 h-3.5 text-amber-500" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
            <Gauge className="w-3.5 h-3.5 text-indigo-500" />
            <span>Current Speed</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatSpeed(metrics.currentSpeed)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>ETA Remaining</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatDuration(metrics.etaSeconds)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
            <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
            <span>Transferred</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatBytes(metrics.bytesTransferred)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/80">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
            <span>Total Target</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white">
            {formatBytes(metrics.totalBytes)}
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-4">
        {/* Total Progress */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
            <span className="text-slate-700 dark:text-slate-300">Total Transfer Progress</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400">{percentRounded}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${percentRounded}%` }}
            />
          </div>
        </div>

        {/* Current File Progress */}
        <div>
          <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            <span className="truncate max-w-[280px]">Current File: {metrics.currentFileName}</span>
            <span className="font-mono">{Math.round(metrics.currentFilePercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-400 dark:bg-slate-600 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.round(metrics.currentFilePercent)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
