import React, { useRef } from 'react';
import { AlertCircle, ArrowRight, Link2 } from 'lucide-react';
import { Button } from './ui/Button';
import { IconBadge } from './ui/IconBadge';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { StatusCard } from './ui/StatusCard';
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
  /** Offered on the landing page, for when the sender can only read out a room code */
  onSwitchToReceive?: () => void;
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
  onSwitchToReceive,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const shareUrl = roomCode && shareKey ? buildShareUrl(window.location.href, roomCode, shareKey) : '';
  const isAwaitingReceiver = transferState === 'awaiting_receiver';
  const hasRoomError = !roomCode && !!errorMessage;
  const isLanding = files.length === 0 && !isAwaitingReceiver && !pendingPeerId;

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
      <StatusCard
        badge={<IconBadge icon={AlertCircle} tone="danger" />}
        title="Transfer Failed"
        description={errorMessage ?? 'The transfer stopped unexpectedly.'}
      >
        <Button onClick={onDismissError} className="px-6">
          Back to Files
        </Button>
      </StatusCard>
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
        <Notice tone="brand" icon={Link2}>
          A receiver opened your link. Add files and they are offered to them straight away.
        </Notice>
      )}

      <FileDropZone onAddFiles={onAddFiles} fileInputRef={fileInputRef} isCompact={files.length > 0} />

      {isLanding && (
        <div className="text-center space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No account · Nothing stored · Straight from your device to theirs
          </p>
          {onSwitchToReceive && (
            <LinkButton onClick={onSwitchToReceive}>
              Got a code? Receive files
              <ArrowRight className="w-4 h-4" />
            </LinkButton>
          )}
        </div>
      )}

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
