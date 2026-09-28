import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Screen } from './ui/Screen';
import { IconBadge } from './ui/IconBadge';
import { Button } from './ui/Button';
import { StatusCard } from './ui/StatusCard';
import type { ReceiverStatus, TransferManifest } from '../types/transfer';
import type { ReceiverSession } from '../hooks/useReceiverSession';
import { TransferSummary } from './TransferSummary';
import { PinEntryCard } from './PinEntryCard';
import { WaitingForSenderCard } from './WaitingForSenderCard';
import type { WaitingStage } from './WaitingForSenderCard';
import { IncomingFilesCard } from './IncomingFilesCard';
import { RoomCodeForm } from './RoomCodeForm';
import { pickFiles } from '../utils/fileSelection';

interface ReceiverViewProps {
  session: ReceiverSession;
}

function getWaitingStage(
  status: ReceiverStatus,
  isInvited: boolean,
  manifest: TransferManifest | null
): WaitingStage | null {
  if (status === 'connecting') {
    return 'connecting';
  }
  if (status === 'verifying_pin') {
    return 'pin';
  }
  if (status === 'reconnecting') {
    return 'reconnecting';
  }
  if (status === 'waiting_approval') {
    return isInvited ? 'files' : 'approval';
  }
  if (status === 'connected' && manifest?.files.length === 0) {
    return 'files';
  }
  return null;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({ session }) => {
  const { state, actions } = session;
  const { status, manifest, selectedFileIndices, isPaused } = state;
  const waitingStage = getWaitingStage(status, state.isInvited, manifest);
  const isTransferring = status === 'transferring';
  const hasDownloaded = isTransferring || status === 'completed';
  const isChoosing = status === 'connected' && !waitingStage;

  return (
    <Screen>
      {/* One list from choosing through downloading to done, so ticks and scroll position survive */}
      {manifest && (isChoosing || hasDownloaded) ? (
        <>
          {hasDownloaded && (
            <TransferSummary
              metrics={state.metrics}
              files={pickFiles(manifest.files, selectedFileIndices)}
              isPaused={isPaused}
              queuePosition={isTransferring ? state.queuePosition : null}
              completion={isTransferring ? null : { corruptedFiles: state.corruptedFiles }}
            />
          )}
          <IncomingFilesCard
            manifest={manifest}
            onStartSaving={actions.startSaving}
            download={isTransferring ? { fileIndices: selectedFileIndices, metrics: state.metrics, isPaused } : null}
            finishedFiles={state.finishedFiles}
            hasSenderLeft={state.hasSenderLeft}
            onTogglePause={actions.togglePause}
            onCancel={actions.cancel}
            onDone={actions.reset}
          />
        </>
      ) : status === 'error' && state.error ? (
        // A dead end gets its own screen: the code form would invite retrying something that cannot work
        <StatusCard
          badge={<IconBadge icon={AlertCircle} tone="danger" />}
          title="Couldn’t receive the files"
          description={state.error}
        >
          <div className="flex flex-wrap justify-center gap-3">
            <Button data-testid="retry-connect" onClick={actions.connect} className="px-6">
              <RotateCw className="w-4 h-4" />
              Try again
            </Button>
            <Button data-testid="enter-other-code" variant="secondary" onClick={actions.reset} className="px-6">
              Enter a different code
            </Button>
          </div>
        </StatusCard>
      ) : waitingStage ? (
        <WaitingForSenderCard
          stage={waitingStage}
          roomCode={state.roomCode}
          // Still connecting there is no engine to cancel; starting over abandons the attempt
          onCancel={waitingStage === 'connecting' ? actions.reset : actions.cancel}
          onRetry={waitingStage === 'reconnecting' ? actions.retryNow : undefined}
        />
      ) : status === 'pin_required' && state.pinPrompt ? (
        <PinEntryCard pin={state.pin} prompt={state.pinPrompt} onPinChange={actions.setPin} onSubmit={actions.submitPin} />
      ) : (
        <RoomCodeForm roomCode={state.roomCode} onRoomCodeChange={actions.setRoomCode} onConnect={actions.connect} />
      )}
    </Screen>
  );
};
