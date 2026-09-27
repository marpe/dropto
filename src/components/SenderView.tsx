import React, { useRef } from 'react';
import { AlertCircle, Link2 } from 'lucide-react';
import { Button } from './ui/Button';
import type { SenderStatus, TransferFile, TransferMetrics } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { buildShareUrl } from '../utils/shareLink';
import { MetricsDashboard } from './MetricsDashboard';
import { PeerApprovalModal } from './PeerApprovalModal';
import { TransferCompleteCard } from './TransferCompleteCard';
import { FileDropZone } from './FileDropZone';
import { FileQueue } from './FileQueue';
import { ShareBox } from './ShareBox';
import { ReceiverChoosingCard } from './ReceiverChoosingCard';

interface SenderViewProps {
  roomCode: string;
  shareKey: string;
  files: TransferFile[];
  onAddFiles: (newFiles: File[]) => void;
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  transferMetrics: TransferMetrics | null;
  transferState: SenderStatus;
  pendingPeerId: string | null;
  isPendingPeerTrusted: boolean;
  onApprovePeer: () => void;
  onRejectPeer: () => void;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  pin: string;
  onPinChange: (newPin: string) => void;
  corruptedFiles: string[];
  isPaused: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  onRetryRoom: () => void;
}

export const SenderView: React.FC<SenderViewProps> = ({
  roomCode,
  shareKey,
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  transferMetrics,
  transferState,
  pendingPeerId,
  isPendingPeerTrusted,
  onApprovePeer,
  onRejectPeer,
  onTogglePause,
  onCancelTransfer,
  pin,
  onPinChange,
  corruptedFiles,
  isPaused,
  errorMessage,
  onDismissError,
  onRetryRoom,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const shareUrl = roomCode && shareKey ? buildShareUrl(window.location.href, roomCode, shareKey) : '';
  const isAwaitingReceiver = transferState === 'awaiting_receiver';
  const hasRoomError = !roomCode && !!errorMessage;

  if (transferState === 'transferring') {
    return (
      <div className="w-full space-y-6 animate-fade-in">
        {transferMetrics && (
          <MetricsDashboard
            metrics={transferMetrics}
            isSender={true}
            isPaused={isPaused}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        )}
      </div>
    );
  }

  if (transferState === 'failed') {
    return (
      <div className="w-full rounded-2xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-balance text-zinc-900 dark:text-white mb-2">Transfer Failed</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 break-words">
          {errorMessage ?? 'The transfer stopped unexpectedly.'}
        </p>
        <Button onClick={onDismissError} className="px-6">
          Back to Files
        </Button>
      </div>
    );
  }

  if (transferState === 'completed') {
    return (
      <TransferCompleteCard
        successTitle="Transfer Complete!"
        successDescription={`All ${files.length} files (${formatBytes(totalSize)}) transferred and verified successfully.`}
        actionLabel="Send More Files"
        onAction={onClearFiles}
        corruptedFiles={corruptedFiles}
      />
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {pendingPeerId && !isPendingPeerTrusted && (
        <PeerApprovalModal
          isOpen={true}
          peerId={pendingPeerId}
          fileCount={files.length}
          totalBytes={totalSize}
          onApprove={onApprovePeer}
          onReject={onRejectPeer}
          onSelectFiles={() => fileInputRef.current?.click()}
        />
      )}

      {isAwaitingReceiver && <ReceiverChoosingCard onCancel={onCancelTransfer} />}

      {pendingPeerId && isPendingPeerTrusted && (
        <div className="flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">
          <Link2 className="w-4 h-4 shrink-0 text-brand-500" />
          <span>A receiver opened your link. Add files and they are offered to them straight away.</span>
        </div>
      )}

      <FileDropZone onAddFiles={onAddFiles} fileInputRef={fileInputRef} isCompact={files.length > 0} />

      {files.length > 0 && <FileQueue files={files} onRemoveFile={onRemoveFile} onClearFiles={onClearFiles} />}

      {/* Nothing to share until files are queued; a receiver is already connected while it chooses */}
      {((files.length > 0 && !isAwaitingReceiver) || hasRoomError) && (
        <ShareBox
          roomCode={roomCode}
          shareUrl={shareUrl}
          pin={pin}
          onPinChange={onPinChange}
          errorMessage={errorMessage}
          onRetryRoom={onRetryRoom}
        />
      )}
    </div>
  );
};
