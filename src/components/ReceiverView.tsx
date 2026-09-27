import React, { useState } from 'react';
import { DownloadCloud, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, HardDriveDownload } from 'lucide-react';
import type { TransferManifest, TransferMetrics } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { MetricsDashboard } from './MetricsDashboard';

interface ReceiverViewProps {
  roomCode: string;
  onRoomCodeChange: (code: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  onConnect: () => void;
  connectionState: 'idle' | 'connecting' | 'waiting_approval' | 'connected' | 'transferring' | 'completed' | 'error';
  manifest: TransferManifest | null;
  transferMetrics: TransferMetrics | null;
  onStartSaving: () => void;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  isPaused: boolean;
  errorMessage: string | null;
  isNativeFSA: boolean;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({
  roomCode,
  onRoomCodeChange,
  pin,
  onPinChange,
  onConnect,
  connectionState,
  manifest,
  transferMetrics,
  onStartSaving,
  onTogglePause,
  onCancelTransfer,
  isPaused,
  errorMessage,
  isNativeFSA,
}) => {
  const [pinRequiredBySender] = useState(false);
  const [isPreparingSave, setIsPreparingSave] = useState(false);

  const handleStartSaveClick = async () => {
    setIsPreparingSave(true);
    try {
      await onStartSaving();
    } finally {
      setIsPreparingSave(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Active Transfer State */}
      {connectionState === 'transferring' ? (
        transferMetrics ? (
          <MetricsDashboard
            metrics={transferMetrics}
            isSender={false}
            isPaused={isPaused}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        ) : (
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl">
            <div className="w-10 h-10 mx-auto mb-4 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Preparing Stream to Disk...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Connecting stream chunks to storage
            </p>
          </div>
        )
      ) : connectionState === 'completed' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Download Complete & Verified!
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            All files were written directly to disk and verified with cryptographic checksums.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
          >
            Receive More Files
          </button>
        </div>
      ) : manifest ? (
        /* Manifest Received - Ready to Choose Save Location */
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Incoming Files Ready ({manifest.files.length} {manifest.files.length === 1 ? 'file' : 'files'})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total transfer size: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatBytes(manifest.totalBytes)}</span>
              </p>
            </div>
          </div>

          {/* Files List Preview */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 mb-6 max-h-56 overflow-y-auto space-y-2">
            {manifest.files.map((file, idx) => (
              <div key={file.id || idx} className="flex justify-between items-center text-xs p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50">
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate mr-3">
                  {file.relativePath || file.name}
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                  {formatBytes(file.size)}
                </span>
              </div>
            ))}
          </div>

          {/* Disk streaming notice */}
          <div className="p-3.5 mb-6 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/50 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 dark:text-slate-300">
              <span className="font-semibold block text-slate-900 dark:text-white">
                {isNativeFSA ? 'Zero-RAM Native Disk Streaming Supported' : 'Streaming Download Active'}
              </span>
              Clicking below will prompt you to select the save destination. Incoming 64KB chunks will stream direct to disk to prevent memory overflows.
            </div>
          </div>

          <button
            onClick={handleStartSaveClick}
            disabled={isPreparingSave}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-base font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-75 text-white shadow-xl shadow-indigo-600/25 transition-all"
          >
            {isPreparingSave ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Opening File Dialog...</span>
              </>
            ) : (
              <>
                <HardDriveDownload className="w-5 h-5" />
                <span>Select Save Location & Start Download</span>
              </>
            )}
          </button>
        </div>
      ) : (
        /* Room Code Entry Card */
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
            <DownloadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Receive Files via P2P
          </h3>
          <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
            Enter the 6-digit room code provided by the sender to connect directly over WebRTC.
          </p>

          {errorMessage && (
            <div className="p-3 mb-5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-4 max-w-md mx-auto">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Room Code
              </label>
              <input
                type="text"
                placeholder="DW-XXXXXX"
                value={roomCode}
                onChange={(e) => onRoomCodeChange(e.target.value.toUpperCase())}
                className="w-full text-center font-mono text-xl sm:text-2xl font-bold tracking-widest py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {pinRequiredBySender && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Room PIN
                </label>
                <input
                  type="text"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={(e) => onPinChange(e.target.value)}
                  className="w-full text-center font-mono text-sm py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}

            <button
              onClick={onConnect}
              disabled={!roomCode.trim() || connectionState === 'connecting' || connectionState === 'waiting_approval'}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-indigo-600/20 transition-all"
            >
              {connectionState === 'connecting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to Peer...</span>
                </>
              ) : connectionState === 'waiting_approval' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Waiting for Sender Approval...</span>
                </>
              ) : (
                <>
                  <span>Connect & Download</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
