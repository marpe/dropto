import React, { useState, useEffect } from 'react';
import { DownloadCloud, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, HardDriveDownload } from 'lucide-react';
import type { TransferManifest, TransferMetrics } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { MetricsDashboard } from './MetricsDashboard';
import { fireCelebration } from '../services/confetti';

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

  useEffect(() => {
    if (connectionState === 'completed') {
      fireCelebration();
    }
  }, [connectionState]);

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
          <div className="rounded-3xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl">
            <div className="w-10 h-10 mx-auto mb-4 border-3 border-[#3ECF8E] border-t-transparent rounded-full animate-spin" />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
              Preparing Stream to Disk...
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Connecting stream chunks to storage
            </p>
          </div>
        )
      ) : connectionState === 'completed' ? (
        <div className="rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/30 text-[#3ECF8E] flex items-center justify-center animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            Download Complete & Verified!
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            All files were written directly to disk and verified with cryptographic checksums.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl font-bold bg-[#3ECF8E] hover:bg-[#24b47e] text-[#121212] shadow-lg shadow-[#3ECF8E]/25 transition-all hover:scale-105"
          >
            Receive More Files
          </button>
        </div>
      ) : manifest ? (
        /* Manifest Received - Ready to Choose Save Location */
        <div className="rounded-3xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 text-[#3ECF8E] flex items-center justify-center">
              <DownloadCloud className="w-6 h-6 animate-float" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Incoming Files Ready ({manifest.files.length} {manifest.files.length === 1 ? 'file' : 'files'})
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Total transfer size: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatBytes(manifest.totalBytes)}</span>
              </p>
            </div>
          </div>

          {/* Files List Preview */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6 max-h-56 overflow-y-auto space-y-2">
            {manifest.files.map((file, idx) => (
              <div key={file.id || idx} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 hover:border-[#3ECF8E]/30 transition-colors">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate mr-3">
                  {file.relativePath || file.name}
                </span>
                <span className="font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
                  {formatBytes(file.size)}
                </span>
              </div>
            ))}
          </div>

          {/* Disk streaming notice */}
          <div className="p-3.5 mb-6 rounded-xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#3ECF8E] shrink-0 mt-0.5" />
            <div className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="font-semibold block text-zinc-900 dark:text-white">
                {isNativeFSA ? 'Zero-RAM Native Disk Streaming Supported' : 'Streaming Download Active'}
              </span>
              Clicking below will prompt you to select the save destination. Incoming 64KB chunks will stream direct to disk to prevent memory overflows.
            </div>
          </div>

          <button
            onClick={handleStartSaveClick}
            disabled={isPreparingSave}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl text-base font-bold bg-[#3ECF8E] hover:bg-[#24b47e] disabled:opacity-75 text-[#121212] shadow-xl shadow-[#3ECF8E]/25 transition-all hover:scale-[1.02]"
          >
            {isPreparingSave ? (
              <>
                <div className="w-5 h-5 border-2 border-[#121212] border-t-transparent rounded-full animate-spin" />
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
        <div className="rounded-3xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 text-[#3ECF8E] flex items-center justify-center shadow-inner">
            <DownloadCloud className="w-8 h-8 animate-float" />
          </div>

          <h3 className="text-xl font-bold text-center text-zinc-900 dark:text-white mb-2">
            Receive Files via P2P
          </h3>
          <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
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
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Room Code
              </label>
              <input
                type="text"
                placeholder="DW-XXXXXX"
                value={roomCode}
                onChange={(e) => onRoomCodeChange(e.target.value.toUpperCase())}
                className="w-full text-center font-mono text-xl sm:text-2xl font-bold tracking-widest py-3 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white focus:ring-2 focus:ring-[#3ECF8E]/50 focus:border-[#3ECF8E] focus:outline-none transition-all"
              />
            </div>

            {pinRequiredBySender && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Room PIN
                </label>
                <input
                  type="text"
                  placeholder="Enter PIN"
                  value={pin}
                  onChange={(e) => onPinChange(e.target.value)}
                  className="w-full text-center font-mono text-sm py-2 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white focus:border-[#3ECF8E] focus:outline-none"
                />
              </div>
            )}

            <button
              onClick={onConnect}
              disabled={!roomCode.trim() || connectionState === 'connecting' || connectionState === 'waiting_approval'}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold bg-[#3ECF8E] hover:bg-[#24b47e] disabled:opacity-50 text-[#121212] shadow-lg shadow-[#3ECF8E]/25 transition-all hover:scale-[1.02]"
            >
              {connectionState === 'connecting' ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#121212] border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to Peer...</span>
                </>
              ) : connectionState === 'waiting_approval' ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#121212] border-t-transparent rounded-full animate-spin" />
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
