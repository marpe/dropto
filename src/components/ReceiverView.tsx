import React from 'react';
import { DownloadCloud, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { getActiveBrand } from '../branding';
import type { ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';
import { MetricsDashboard } from './MetricsDashboard';
import { TransferCompleteCard } from './TransferCompleteCard';
import { PinEntryCard } from './PinEntryCard';
import { WaitingForSenderCard } from './WaitingForSenderCard';
import type { WaitingStage } from './WaitingForSenderCard';
import { IncomingFilesCard } from './IncomingFilesCard';
import type { PinPrompt } from '../types/transfer';

interface ReceiverViewProps {
  roomCode: string;
  onRoomCodeChange: (code: string) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  onConnect: () => void;
  connectionState: ReceiverStatus;
  pinPrompt: PinPrompt | null;
  onSubmitPin: () => void;
  manifest: TransferManifest | null;
  transferMetrics: TransferMetrics | null;
  onStartSaving: () => void | Promise<void>;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  isPaused: boolean;
  errorMessage: string | null;
  isNativeFSA: boolean;
  corruptedFiles: string[];
  onReset: () => void;
  /** Connected through the sender's link, so there is no approval to wait for */
  isInvited?: boolean;
}

function getWaitingStage(
  status: ReceiverStatus,
  isInvited: boolean,
  manifest: TransferManifest | null
): WaitingStage | null {
  if (status === 'verifying_pin') {
    return 'pin';
  }
  if (status === 'waiting_approval') {
    return isInvited ? 'files' : 'approval';
  }
  if (status === 'connected' && manifest?.files.length === 0) {
    return 'files';
  }
  return null;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({
  roomCode,
  onRoomCodeChange,
  pin,
  onPinChange,
  onConnect,
  connectionState,
  pinPrompt,
  onSubmitPin,
  manifest,
  transferMetrics,
  onStartSaving,
  onTogglePause,
  onCancelTransfer,
  isPaused,
  errorMessage,
  isNativeFSA,
  corruptedFiles,
  onReset,
  isInvited = false,
}) => {
  const waitingStage = getWaitingStage(connectionState, isInvited, manifest);

  return (
    <div className="w-full space-y-6 animate-fade-in">
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
          <div className="rounded-3xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl">
            <Spinner className="w-10 h-10 mx-auto mb-4 border-[3px] text-brand-500" />
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
              Preparing Stream to Disk…
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Connecting stream chunks to storage
            </p>
          </div>
        )
      ) : connectionState === 'completed' ? (
        <TransferCompleteCard
          successTitle="Download Complete & Verified!"
          successDescription="All files were written directly to disk and verified with CRC-32 checksums."
          actionLabel="Receive More Files"
          onAction={onReset}
          corruptedFiles={corruptedFiles}
        />
      ) : waitingStage ? (
        <WaitingForSenderCard stage={waitingStage} roomCode={roomCode} onCancel={onCancelTransfer} />
      ) : connectionState === 'pin_required' && pinPrompt ? (
        <PinEntryCard pin={pin} prompt={pinPrompt} onPinChange={onPinChange} onSubmit={onSubmitPin} />
      ) : manifest ? (
        <IncomingFilesCard manifest={manifest} isNativeFSA={isNativeFSA} onStartSaving={onStartSaving} />
      ) : (
        /* Room Code Entry Card */
        <div className="rounded-3xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center shadow-inner">
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
                placeholder={`${getActiveBrand().roomPrefix}-XXXXXX`}
                value={roomCode}
                onChange={(e) => onRoomCodeChange(e.target.value.toUpperCase())}
                className="w-full text-center font-mono text-xl sm:text-2xl font-bold tracking-widest py-3 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 focus:outline-none transition-all"
              />
            </div>

            <Button
              size="lg"
              onClick={onConnect}
              disabled={!roomCode.trim() || connectionState === 'connecting'}
              className="w-full py-3 motion-safe:hover:scale-[1.02]"
            >
              {connectionState === 'connecting' ? (
                <>
                  <Spinner />
                  <span>Connecting to Peer…</span>
                </>
              ) : (
                <>
                  <span>Connect & Download</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
