import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Link2, Radio } from 'lucide-react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { IconBadge } from './ui/IconBadge';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { StatusCard } from './ui/StatusCard';
import type { SenderStatus, TransferFile, TransferMetrics } from '../types/transfer';
import type { SharingOptions } from '../hooks/useSenderSession';
import { buildShareUrl } from '../utils/shareLink';
import { pickFiles } from '../utils/fileSelection';
import { displayPath } from '../utils/filePath';
import { MetricsDashboard } from './MetricsDashboard';
import { PeerApprovalModal } from './PeerApprovalModal';
import { TransferCompleteCard } from './TransferCompleteCard';
import { FileDropZone } from './FileDropZone';
import { FileQueue } from './FileQueue';
import { ShareStep } from './ShareStep';
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
  requireApproval: boolean;
  onRequireApprovalChange: (requireApproval: boolean) => void;
  /** The link has been created; the options can then only change through "Edit sharing" */
  isShared: boolean;
  onCreateLink: () => void;
  onUpdateSharing: (options: SharingOptions, applyTo: 'new' | 'now') => void;
  corruptedFiles: string[];
  isPaused: boolean;
  errorMessage: string | null;
  onDismissError: () => void;
  onRetryRoom: () => void;
  roomNotice?: string | null;
  /** The files the receiver chose; null means all of them */
  receiverFileIndices?: number[] | null;
  /** Offered on the landing page, for when the sender can only read out a room code */
  onSwitchToReceive?: () => void;
}

type Step = 'files' | 'share';

const REMOVAL_TITLES = {
  file: 'Remove this file?',
  all: 'Remove all files?',
  restart: 'Start over?',
} as const;

type PendingRemoval = { kind: 'file'; file: TransferFile } | { kind: 'all' } | { kind: 'restart' };

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
  requireApproval,
  onRequireApprovalChange,
  isShared,
  onCreateLink,
  onUpdateSharing,
  corruptedFiles,
  isPaused,
  errorMessage,
  onDismissError,
  onRetryRoom,
  roomNotice = null,
  receiverFileIndices = null,
  onSwitchToReceive,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(() => (isShared ? 'share' : 'files'));
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const shareUrl = roomCode && shareKey ? buildShareUrl(window.location.href, roomCode, shareKey) : '';
  const isAwaitingReceiver = transferState === 'awaiting_receiver';
  const transferFiles = pickFiles(files, receiverFileIndices);
  const hasRoomError = !roomCode && !!errorMessage;
  const isLanding = files.length === 0 && !isAwaitingReceiver && !pendingPeerId;
  // Nothing to share without files, whatever step the sender was on
  const currentStep: Step = files.length === 0 ? 'files' : step;

  // Removing what a connected receiver is looking at deserves a second thought; otherwise just do it
  const requestRemoveFile = (file: TransferFile) => {
    if (isAwaitingReceiver) {
      setPendingRemoval({ kind: 'file', file });
    } else {
      onRemoveFile(file.id);
    }
  };
  const requestClearFiles = () => {
    if (isAwaitingReceiver) {
      setPendingRemoval({ kind: 'all' });
    } else if (isShared) {
      setPendingRemoval({ kind: 'restart' });
    } else {
      onClearFiles();
    }
  };
  const confirmRemoval = () => {
    if (pendingRemoval?.kind === 'file') {
      onRemoveFile(pendingRemoval.file.id);
    } else if (pendingRemoval) {
      onClearFiles();
    }
    setPendingRemoval(null);
  };

  if (transferState === 'transferring') {
    return (
      <div className="w-full space-y-6 animate-fade-in">
        {transferMetrics && (
          <MetricsDashboard
            metrics={transferMetrics}
            files={transferFiles}
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
        title="Transfer Complete!"
        actionLabel="Send More Files"
        onAction={onClearFiles}
        files={transferFiles}
        metrics={transferMetrics}
        corruptedFiles={corruptedFiles}
      />
    );
  }

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Requests only surface once the sender has actually shared; earlier ones wait */}
      {isShared && pendingPeerId && !isPendingPeerTrusted && (
        <PeerApprovalModal
          peerId={pendingPeerId}
          fileCount={files.length}
          totalBytes={totalSize}
          onApprove={onApprovePeer}
          onReject={onRejectPeer}
          onSelectFiles={() => fileInputRef.current?.click()}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title={REMOVAL_TITLES[pendingRemoval.kind]}
          confirmLabel={pendingRemoval.kind === 'restart' ? 'Start over' : 'Remove'}
          tone="danger"
          onConfirm={confirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        >
          <p>
            {pendingRemoval.kind === 'file' &&
              `Someone is connected and choosing where to save. ${displayPath(pendingRemoval.file)} will disappear from their list.`}
            {pendingRemoval.kind === 'all' &&
              'Someone is connected and choosing where to save. Their list will be empty until you add files again.'}
            {pendingRemoval.kind === 'restart' &&
              'Clearing everything starts a new share: your current link stops working, and you get a new one when you share again.'}
          </p>
        </ConfirmDialog>
      )}

      {hasRoomError && (
        <Notice tone="danger" icon={AlertCircle}>
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage}</span>
            <Button variant="secondary" size="sm" onClick={onRetryRoom}>
              Retry
            </Button>
          </span>
        </Notice>
      )}

      {isAwaitingReceiver && <ReceiverChoosingCard onCancel={onCancelTransfer} />}

      {currentStep === 'share' ? (
        <ShareStep
          files={files}
          onEditFiles={() => setStep('files')}
          isShared={isShared}
          options={{ pin, requireApproval }}
          onOptionsChange={(options) => {
            onPinChange(options.pin);
            onRequireApprovalChange(options.requireApproval);
          }}
          onCreateLink={onCreateLink}
          onUpdateSharing={onUpdateSharing}
          hasConnectedReceiver={isAwaitingReceiver}
          roomCode={roomCode}
          shareUrl={shareUrl}
          roomNotice={roomNotice}
        />
      ) : (
        <>
          {pendingPeerId && isPendingPeerTrusted && (
            <Notice tone="brand" icon={Link2}>
              Someone opened your link. Add files and share them to let them in.
            </Notice>
          )}

          {isShared && files.length > 0 && (
            <Notice tone="brand" icon={Radio}>
              Your link is live: anyone who opens it sees changes to this list.
            </Notice>
          )}

          <FileDropZone onAddFiles={onAddFiles} fileInputRef={fileInputRef} isCompact={files.length > 0} />

          {isLanding && onSwitchToReceive && (
            <div className="text-center">
              <LinkButton onClick={onSwitchToReceive}>
                Got a code? Receive files
                <ArrowRight className="w-4 h-4" />
              </LinkButton>
            </div>
          )}

          {files.length > 0 && (
            <FileQueue
              files={files}
              onRemoveFile={(fileId) => {
                const file = files.find((candidate) => candidate.id === fileId);
                if (file) {
                  requestRemoveFile(file);
                }
              }}
              onClearFiles={requestClearFiles}
              footer={
                <Button data-testid="share-files" onClick={() => setStep('share')} className="w-full">
                  <span>{isShared ? 'Back to link' : `Share ${files.length === 1 ? '1 file' : `${files.length} files`}`}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              }
            />
          )}
        </>
      )}
    </div>
  );
};
