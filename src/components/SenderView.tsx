import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Link2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { BottomBar } from './ui/BottomBar';
import { Inset } from './ui/Inset';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { LinkButton } from './ui/LinkButton';
import { Notice } from './ui/Notice';
import { Screen } from './ui/Screen';
import type { TransferFile } from '../types/transfer';
import type { SenderSession } from '../hooks/useSenderSession';
import { countActiveReceivers } from '../hooks/senderState';
import { buildShareUrl } from '../utils/shareLink';
import { displayPath } from '../utils/filePath';
import { FileDropZone } from './FileDropZone';
import { FileQueue } from './FileQueue';
import { LinkBar } from './LinkBar';
import { ReceiverList } from './ReceiverList';

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
  const { state, status, actions } = session;
  const { files, missingFiles, isShared, options, roomCode, shareKey, receivers, pendingPeers } = state;
  // After a reload the list can hold only files waiting to be added again; it still shows
  const hasList = files.length + missingFiles.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  const shareUrl = roomCode && shareKey ? buildShareUrl(window.location.href, roomCode, shareKey) : '';
  const isAwaitingReceiver = status === 'awaiting_receiver';
  const connectedCount = countActiveReceivers(receivers) + receivers.filter((r) => r.stage === 'queued').length;
  // Someone connected and not downloading may be choosing from this list, so removing things changes what they see
  const isSomeoneChoosing = receivers.some((receiver) => receiver.idleSinceMs !== null);
  // Link holders are let in once there are shared files; until then they are listed with what they wait for
  const waitingFor = files.length === 0 ? 'Waiting for files' : 'Joins when you share';
  const hasRoomError = !roomCode && !!state.roomError;
  const isLanding = !hasList && !isAwaitingReceiver && pendingPeers.length === 0;

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

  return (
    <Screen key={hasList ? 'files' : 'landing'}>
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
              `${displayPath(pendingRemoval.file)} will disappear from the list someone is choosing from.`}
            {pendingRemoval.kind === 'all' &&
              'Someone is choosing files; their list will be empty.'}
            {pendingRemoval.kind === 'restart' &&
              'Downloads stop and the link stops working.'}
          </p>
        </ConfirmDialog>
      )}

      {hasRoomError && (
        <Inset>
          <Notice tone="danger" icon={AlertCircle}>
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>{state.roomError}</span>
              <Button variant="secondary" size="sm" onClick={actions.retryRoom}>
                Retry
              </Button>
            </span>
          </Notice>
        </Inset>
      )}

      {!hasList ? (
        <>
          <FileDropZone onAddFiles={actions.addFiles} fileInputRef={fileInputRef} />
          {isLanding && onSwitchToReceive && (
            <Inset className="text-center">
              <LinkButton onClick={onSwitchToReceive}>
                Got a code? Receive files
                <ArrowRight className="w-4 h-4" />
              </LinkButton>
            </Inset>
          )}
        </>
      ) : (
        <FileQueue
          files={files}
          missingFiles={missingFiles}
          onAddFiles={actions.addFiles}
          fileInputRef={fileInputRef}
          onRemoveFile={(fileId) => {
            const file = files.find((candidate) => candidate.id === fileId);
            if (file) {
              requestRemoveFile(file);
            } else {
              // A missing file was never offered to anyone, so it goes without asking
              actions.removeFile(fileId);
            }
          }}
          onClearFiles={requestClearFiles}
        />
      )}

      {files.length > 0 && !isShared && (
        <BottomBar>
          <Button data-testid="share-files" size="lg" onClick={actions.createLink}>
            <Link2 className="w-5 h-5" />
            <span>Share</span>
          </Button>
        </BottomBar>
      )}

      {isShared && (
        <LinkBar
          roomCode={roomCode}
          shareUrl={shareUrl}
          roomNotice={state.roomNotice}
          options={options}
          onUpdateSharing={actions.updateSharing}
          onStopSharing={actions.stopSharing}
          connectedCount={connectedCount}
        />
      )}

      {/* Whoever is connected is listed, from the moment they arrive (even on an empty page after a reload) */}
      {(receivers.length > 0 || pendingPeers.length > 0) && (
        <Card padding="sm">
          <ReceiverList
            requests={pendingPeers}
            receivers={receivers}
            waitingFor={waitingFor}
            onAccept={actions.approvePeer}
            onDecline={actions.rejectPeer}
            onStopReceiver={actions.stopReceiver}
            onDismissReceiver={actions.dismissReceiver}
            onTogglePauseReceiver={actions.togglePauseReceiver}
          />
        </Card>
      )}
    </Screen>
  );
};
