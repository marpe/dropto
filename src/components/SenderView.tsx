import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Link2, Radio } from 'lucide-react';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { IconBadge } from './ui/IconBadge';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { Screen } from './ui/Screen';
import { StatusCard } from './ui/StatusCard';
import type { TransferFile } from '../types/transfer';
import type { SenderSession } from '../hooks/useSenderSession';
import { countActiveReceivers } from '../hooks/senderState';
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
  session: SenderSession;
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

export const SenderView: React.FC<SenderViewProps> = ({ session, onSwitchToReceive }) => {
  const { state, status, focus, actions } = session;
  const { files, isShared, options, roomCode, shareKey, receivers, pendingPeers } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(() => (isShared ? 'share' : 'files'));
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const shareUrl = roomCode && shareKey ? buildShareUrl(window.location.href, roomCode, shareKey) : '';
  const isAwaitingReceiver = status === 'awaiting_receiver';
  const connectedCount = countActiveReceivers(receivers) + receivers.filter((r) => r.stage === 'queued').length;
  // Someone is deciding what to download from this list, so removing things from it changes what they see
  const isSomeoneChoosing = receivers.some((receiver) => receiver.stage === 'choosing');
  const approvalRequest = pendingPeers.find((peer) => !peer.isTrusted) ?? null;
  const hasEarlyVisitor = pendingPeers.some((peer) => peer.isTrusted);
  const hasRoomError = !roomCode && !!state.roomError;
  const isLanding = files.length === 0 && !isAwaitingReceiver && pendingPeers.length === 0;
  // Nothing to share without files, whatever step the sender was on
  const currentStep: Step = files.length === 0 ? 'files' : step;

  const requestRemoveFile = (file: TransferFile) => {
    if (isSomeoneChoosing) {
      setPendingRemoval({ kind: 'file', file });
    } else {
      actions.removeFile(file.id);
    }
  };
  const requestClearFiles = () => {
    if (isAwaitingReceiver) {
      setPendingRemoval({ kind: 'all' });
    } else if (isShared) {
      setPendingRemoval({ kind: 'restart' });
    } else {
      actions.clearFiles();
    }
  };
  const confirmRemoval = () => {
    if (pendingRemoval?.kind === 'file') {
      actions.removeFile(pendingRemoval.file.id);
    } else if (pendingRemoval) {
      actions.clearFiles();
    }
    setPendingRemoval(null);
  };

  if (status === 'transferring' && focus) {
    return (
      <Screen key="transfer">
        {focus.metrics && (
          <MetricsDashboard
            metrics={focus.metrics}
            files={pickFiles(files, focus.fileIndices)}
            isSender={true}
            isPaused={focus.isPaused}
            onTogglePause={actions.togglePause}
            onCancel={actions.cancel}
          />
        )}
      </Screen>
    );
  }

  if (status === 'failed' && focus) {
    return (
      <Screen key="failed">
        <StatusCard
          badge={<IconBadge icon={AlertCircle} tone="danger" />}
          title="Transfer Failed"
          description={focus.error ?? 'The transfer stopped unexpectedly.'}
        >
          <p className="text-xs text-text-4 mb-6">The link still works, so they can try again.</p>
          <Button data-testid="dismiss-error" onClick={actions.dismissError} className="px-6">
            Back to link
          </Button>
        </StatusCard>
      </Screen>
    );
  }

  if (status === 'completed' && focus) {
    return (
      <Screen key="completed">
        <TransferCompleteCard
          title="Transfer Complete!"
          files={pickFiles(files, focus.fileIndices)}
          metrics={focus.metrics}
          corruptedFiles={focus.corruptedFiles}
          actions={
            <>
              <Button
                data-testid="send-again"
                onClick={() => {
                  // Same files, so straight to choosing how the new link is shared
                  setStep('share');
                  actions.stopSharing();
                }}
                className="px-6"
              >
                Send to someone else
              </Button>
              <Button data-testid="send-other-files" variant="secondary" onClick={actions.clearFiles} className="px-6">
                Send other files
              </Button>
            </>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen key={currentStep}>
      {/* Requests only surface once the sender has actually shared; earlier ones wait */}
      {isShared && approvalRequest && (
        <PeerApprovalModal
          peerId={approvalRequest.peerId}
          fileCount={files.length}
          totalBytes={totalSize}
          onApprove={() => actions.approvePeer(approvalRequest.peerId)}
          onReject={() => actions.rejectPeer(approvalRequest.peerId)}
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
              'Clearing everything starts a new share: downloads in progress stop, your current link stops working, and you get a new one when you share again.'}
          </p>
        </ConfirmDialog>
      )}

      {hasRoomError && (
        <Notice tone="danger" icon={AlertCircle}>
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{state.roomError}</span>
            <Button variant="secondary" size="sm" onClick={actions.retryRoom}>
              Retry
            </Button>
          </span>
        </Notice>
      )}

      {isAwaitingReceiver && <ReceiverChoosingCard onCancel={actions.cancel} />}

      {currentStep === 'share' ? (
        <ShareStep
          files={files}
          onEditFiles={() => setStep('files')}
          isShared={isShared}
          options={options}
          onOptionsChange={actions.setSharingOptions}
          onCreateLink={actions.createLink}
          onUpdateSharing={actions.updateSharing}
          onStopSharing={actions.stopSharing}
          connectedCount={connectedCount}
          receivers={receivers}
          onStopReceiver={actions.stopReceiver}
          onDismissReceiver={actions.dismissReceiver}
          roomCode={roomCode}
          shareUrl={shareUrl}
          roomNotice={state.roomNotice}
        />
      ) : (
        <>
          {hasEarlyVisitor && (
            <Notice tone="brand" icon={Link2}>
              Someone opened your link. Add files and share them to let them in.
            </Notice>
          )}

          {isShared && files.length > 0 && (
            <Notice tone="brand" icon={Radio}>
              Your link is live: anyone still choosing sees changes to this list.
            </Notice>
          )}

          <FileDropZone onAddFiles={actions.addFiles} fileInputRef={fileInputRef} isCompact={files.length > 0} />

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
    </Screen>
  );
};
