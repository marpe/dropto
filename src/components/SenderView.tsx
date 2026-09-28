import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Link2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
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
import { WaitingForPeopleCard } from './WaitingForPeopleCard';

interface SenderViewProps {
  session: SenderSession;
  /** Offered on the landing page, for when the sender can only read out a room code */
  onSwitchToReceive?: () => void;
}

/** `files` are the ones someone may be choosing from; `fileIds` also holds missing ones, which go too */
type PendingRemoval = { kind: 'files'; files: TransferFile[]; fileIds: string[] } | { kind: 'all' } | { kind: 'restart' };

/** One file by its path, several by how many */
function describeFiles(files: TransferFile[]): string {
  return files.length === 1 ? displayPath(files[0]) : `${files.length} files`;
}

function removalTitle(removal: PendingRemoval): string {
  if (removal.kind === 'files') {
    return removal.files.length === 1 ? 'Remove this file?' : `Remove ${removal.files.length} files?`;
  }
  return removal.kind === 'all' ? 'Remove all files?' : 'Start over?';
}

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

  const requestRemoveFiles = (fileIds: string[]) => {
    const chosen = new Set(fileIds);
    // Only files on offer can be in someone's list; missing ones never were, so they alone go without asking
    const offered = files.filter((file) => chosen.has(file.id));
    if (isSomeoneChoosing && offered.length > 0) {
      setPendingRemoval({ kind: 'files', files: offered, fileIds });
    } else {
      actions.removeFiles(fileIds);
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
    if (pendingRemoval?.kind === 'files') {
      actions.removeFiles(pendingRemoval.fileIds);
    } else if (pendingRemoval) {
      actions.clearFiles();
    }
    setPendingRemoval(null);
  };

  return (
    <Screen key={hasList ? 'files' : 'landing'}>
      {pendingRemoval && (
        <ConfirmDialog
          title={removalTitle(pendingRemoval)}
          confirmLabel={pendingRemoval.kind === 'restart' ? 'Start over' : 'Remove'}
          tone="danger"
          onConfirm={confirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        >
          <p>
            {pendingRemoval.kind === 'files' &&
              `${describeFiles(pendingRemoval.files)} will disappear from the list someone is choosing from.`}
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
          restorableCount={session.restorableCount}
          onRestoreFiles={() => void actions.restoreFiles()}
          onAddFiles={actions.addFiles}
          fileInputRef={fileInputRef}
          onRemoveFiles={requestRemoveFiles}
          onClearFiles={requestClearFiles}
        />
      )}

      {/* Share takes exactly the link bar's place and size, so creating the link swaps one for the other */}
      {!isShared && files.length > 0 && (
        <Button data-testid="share-files" onClick={actions.createLink} className="w-full h-10 py-0">
          <Link2 className="w-4 h-4" />
          <span>Share</span>
        </Button>
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
      {receivers.length > 0 || pendingPeers.length > 0 ? (
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
      ) : (
        isShared && <WaitingForPeopleCard />
      )}
    </Screen>
  );
};
