import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Link2 } from 'lucide-react';
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
import { settledMetrics } from '../utils/transferProgress';
import { displayPath } from '../utils/filePath';
import { MetricsDashboard } from './MetricsDashboard';
import { PeerApprovalModal } from './PeerApprovalModal';
import { FileDropZone } from './FileDropZone';
import { FileQueue } from './FileQueue';
import { LinkSection } from './LinkSection';
import { ReceiverChoosingCard } from './ReceiverChoosingCard';

interface SenderViewProps {
  session: SenderSession;
  /** Offered on the landing page, for when the sender can only read out a room code */
  onSwitchToReceive?: () => void;
}

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
          title="Transfer failed"
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
      // Same key as the live transfer: the dashboard stays put and settles at 100%
      <Screen key="transfer">
        <MetricsDashboard
          metrics={settledMetrics(focus.metrics, pickFiles(files, focus.fileIndices))}
          files={pickFiles(files, focus.fileIndices)}
          isSender={true}
          isPaused={false}
          onTogglePause={actions.togglePause}
          onCancel={actions.cancel}
          completion={{
            corruptedFiles: focus.corruptedFiles,
            actions: (
            <>
              <Button
                data-testid="send-again"
                onClick={actions.stopSharing}
                className="px-6"
              >
                Send to someone else
              </Button>
              <Button data-testid="send-other-files" variant="secondary" onClick={actions.clearFiles} className="px-6">
                Send other files
              </Button>
            </>
            ),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen key={files.length === 0 ? 'landing' : 'files'}>
      {/* Requests only surface once the sender has actually shared; earlier ones wait */}
      {isShared && approvalRequest && (
        <PeerApprovalModal
          details={approvalRequest.details}
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

      {isAwaitingReceiver && focus && <ReceiverChoosingCard details={focus.details} onCancel={actions.cancel} />}

      {hasEarlyVisitor && (
        <Notice tone="brand" icon={Link2}>
          Someone opened your link. Add files and share them to let them in.
        </Notice>
      )}

      {files.length === 0 ? (
        <>
          <FileDropZone onAddFiles={actions.addFiles} fileInputRef={fileInputRef} />
          {isLanding && onSwitchToReceive && (
            <div className="text-center">
              <LinkButton onClick={onSwitchToReceive}>
                Got a code? Receive files
                <ArrowRight className="w-4 h-4" />
              </LinkButton>
            </div>
          )}
        </>
      ) : (
        <FileQueue
          files={files}
          onAddFiles={actions.addFiles}
          fileInputRef={fileInputRef}
          onRemoveFile={(fileId) => {
            const file = files.find((candidate) => candidate.id === fileId);
            if (file) {
              requestRemoveFile(file);
            }
          }}
          onClearFiles={requestClearFiles}
          footer={
            !isShared && (
              <Button data-testid="share-files" onClick={actions.createLink} className="w-full">
                <Link2 className="w-4 h-4" />
                <span>Share</span>
              </Button>
            )
          }
        />
      )}

      {isShared && files.length > 0 && (
        <LinkSection
          roomCode={roomCode}
          shareUrl={shareUrl}
          roomNotice={state.roomNotice}
          options={options}
          onUpdateSharing={actions.updateSharing}
          onStopSharing={actions.stopSharing}
          connectedCount={connectedCount}
          receivers={receivers}
          onStopReceiver={actions.stopReceiver}
          onDismissReceiver={actions.dismissReceiver}
        />
      )}
    </Screen>
  );
};
