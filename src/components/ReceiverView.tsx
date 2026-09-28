import React from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { Screen } from './ui/Screen';
import { IconBadge } from './ui/IconBadge';
import { Button } from './ui/Button';
import { StatusCard } from './ui/StatusCard';
import type { FinishedFile, ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';
import { TransferSummary } from './TransferSummary';
import { PinEntryCard } from './PinEntryCard';
import { WaitingForSenderCard } from './WaitingForSenderCard';
import type { WaitingStage } from './WaitingForSenderCard';
import { IncomingFilesCard } from './IncomingFilesCard';
import { RoomCodeForm } from './RoomCodeForm';
import { pickFiles } from '../utils/fileSelection';
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
  onStartSaving: (fileIndices?: number[]) => void | Promise<void>;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  isPaused: boolean;
  errorMessage: string | null;
  isNativeFSA: boolean;
  corruptedFiles: string[];
  onReset: () => void;
  /** Connected through the sender's link, so there is no approval to wait for */
  isInvited?: boolean;
  /** Manifest indices being downloaded; null means all of them */
  selectedFileIndices?: number[] | null;
  /** Place in the sender's line while the download waits for a free slot */
  queuePosition?: number | null;
  /** Files downloaded so far on this connection, by id */
  finishedFiles?: Record<string, FinishedFile>;
  /** The sender went away after a finished download */
  hasSenderLeft?: boolean;
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
  selectedFileIndices = null,
  queuePosition = null,
  finishedFiles = {},
  hasSenderLeft = false,
}) => {
  const waitingStage = getWaitingStage(connectionState, isInvited, manifest);
  const isTransferring = connectionState === 'transferring';
  const hasDownloaded = isTransferring || connectionState === 'completed';
  const isChoosing = connectionState === 'connected' && !waitingStage;

  return (
    <Screen>
      {/* One list from choosing through downloading to done, so ticks and scroll position survive */}
      {manifest && (isChoosing || hasDownloaded) ? (
        <>
          {hasDownloaded && (
            <TransferSummary
              metrics={transferMetrics}
              files={pickFiles(manifest.files, selectedFileIndices)}
              isPaused={isPaused}
              queuePosition={isTransferring ? queuePosition : null}
              completion={isTransferring ? null : { corruptedFiles }}
            />
          )}
          <IncomingFilesCard
            manifest={manifest}
            isNativeFSA={isNativeFSA}
            onStartSaving={onStartSaving}
            download={isTransferring ? { fileIndices: selectedFileIndices, metrics: transferMetrics, isPaused } : null}
            finishedFiles={finishedFiles}
            hasSenderLeft={hasSenderLeft}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        </>
      ) : connectionState === 'error' && errorMessage ? (
        // A dead end gets its own screen: the code form would invite retrying something that cannot work
        <StatusCard
          badge={<IconBadge icon={AlertCircle} tone="danger" />}
          title="Couldn’t receive the files"
          description={errorMessage}
        >
          <div className="flex flex-wrap justify-center gap-3">
            <Button data-testid="retry-connect" onClick={onConnect} className="px-6">
              <RotateCw className="w-4 h-4" />
              Try again
            </Button>
            <Button data-testid="enter-other-code" variant="secondary" onClick={onReset} className="px-6">
              Enter a different code
            </Button>
          </div>
        </StatusCard>
      ) : waitingStage ? (
        <WaitingForSenderCard
          stage={waitingStage}
          roomCode={roomCode}
          // Still connecting there is no engine to cancel; starting over abandons the attempt
          onCancel={waitingStage === 'connecting' ? onReset : onCancelTransfer}
        />
      ) : connectionState === 'pin_required' && pinPrompt ? (
        <PinEntryCard pin={pin} prompt={pinPrompt} onPinChange={onPinChange} onSubmit={onSubmitPin} />
      ) : (
        <RoomCodeForm roomCode={roomCode} onRoomCodeChange={onRoomCodeChange} onConnect={onConnect} />
      )}
    </Screen>
  );
};
