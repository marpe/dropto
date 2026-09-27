import React from 'react';
import { Gauge, HardDrive, Clock, CheckCircle2, Pause, Play, XCircle } from 'lucide-react';
import type { TransferMetrics } from '../types/transfer';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';
import { AnimatedWave } from './AnimatedWave';

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
    <div className="w-full rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl relative overflow-hidden transition-all">
      {/* Background ambient Supabase green radial glow */}
      <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-[#3ECF8E]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top row: Status & Actions */}
      <div className="flex items-center justify-between pb-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ECF8E] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3ECF8E]" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>{isSender ? 'Streaming to Receiver' : 'Receiving Direct to Disk'}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#3ECF8E]/10 text-[#3ECF8E] border border-[#3ECF8E]/30">
                Active P2P
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              File {metrics.currentFileIndex + 1} of {metrics.totalFiles} • {metrics.currentFileName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-all hover:scale-105"
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-[#3ECF8E]" /> : <Pause className="w-3.5 h-3.5 text-amber-500" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-all hover:scale-105"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>
      </div>

      {/* Animated Data Stream Wave Banner */}
      <div className="my-5">
        <AnimatedWave active={!isPaused} />
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/80 hover:border-[#3ECF8E]/40 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
            <Gauge className="w-3.5 h-3.5 text-[#3ECF8E]" />
            <span>Current Speed</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-zinc-900 dark:text-white">
            {formatSpeed(metrics.currentSpeed)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/80 hover:border-amber-400/40 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>ETA Remaining</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-zinc-900 dark:text-white">
            {formatDuration(metrics.etaSeconds)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/80 hover:border-[#3ECF8E]/40 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
            <HardDrive className="w-3.5 h-3.5 text-[#3ECF8E]" />
            <span>Transferred</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-zinc-900 dark:text-white">
            {formatBytes(metrics.bytesTransferred)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/80 hover:border-[#3ECF8E]/40 transition-colors">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3ECF8E]" />
            <span>Total Target</span>
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-zinc-900 dark:text-white">
            {formatBytes(metrics.totalBytes)}
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-4">
        {/* Total Progress */}
        <div>
          <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
            <span className="text-zinc-700 dark:text-zinc-300">Total Transfer Progress</span>
            <span className="font-mono text-[#3ECF8E] font-bold">{percentRounded}%</span>
          </div>
          <div className="w-full h-3 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-zinc-200 dark:border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-[#24b47e] via-[#3ECF8E] to-[#52d69b] rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(62,207,142,0.4)]"
              style={{ width: `${percentRounded}%` }}
            />
          </div>
        </div>

        {/* Current File Progress */}
        <div>
          <div className="flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
            <span className="truncate max-w-[280px]">Current File: {metrics.currentFileName}</span>
            <span className="font-mono">{Math.round(metrics.currentFilePercent)}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#3ECF8E]/60 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.round(metrics.currentFilePercent)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
