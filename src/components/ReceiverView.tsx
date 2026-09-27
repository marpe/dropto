import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/Button';
import { LinkButton } from './ui/LinkButton';
import { Spinner } from './ui/Spinner';
import { StatusCard } from './ui/StatusCard';
import type { ReceiverStatus, TransferManifest, TransferMetrics } from '../types/transfer';
import { MetricsDashboard } from './MetricsDashboard';
import { TransferCompleteCard } from './TransferCompleteCard';
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
  onSwitchToSend?: () => void;
  /** Manifest indices being downloaded; null means all of them */
  selectedFileIndices?: number[] | null;
  /** Place in the sender's line while it is busy with others */
  queuePosition?: number | null;
}

function getWaitingStage(
  status: ReceiverStatus,
  isInvited: boolean,
  manifest: TransferManifest | null
): WaitingStage | null {
  if (status === 'connecting') {
    return 'connecting';
  }
  if (status === 'queued') {
    return 'queued';
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
  onSwitchToSend,
  selectedFileIndices = null,
  queuePosition = null,
}) => {
  const waitingStage = getWaitingStage(connectionState, isInvited, manifest);
  const transferFiles = pickFiles(manifest?.files ?? [], selectedFileIndices);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Active Transfer State */}
      {connectionState === 'transferring' ? (
        transferMetrics ? (
          <MetricsDashboard
            metrics={transferMetrics}
            files={transferFiles}
            isSender={false}
            isPaused={isPaused}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        ) : (
          <StatusCard
            badge={<Spinner className="w-10 h-10 border-[3px] text-brand-500" />}
            title="Preparing to save…"
            description="Waiting for you to pick a save location, then for the first data to arrive."
          />
        )
      ) : connectionState === 'completed' ? (
        <TransferCompleteCard
          title="Download complete"
          actions={
            <Button onClick={onReset} className="px-6">
              Receive more files
            </Button>
          }
          files={transferFiles}
          metrics={transferMetrics}
          corruptedFiles={corruptedFiles}
        />
      ) : waitingStage ? (
        <WaitingForSenderCard
          stage={waitingStage}
          roomCode={roomCode}
          queuePosition={queuePosition}
          // Still connecting there is no engine to cancel; starting over abandons the attempt
          onCancel={waitingStage === 'connecting' ? onReset : onCancelTransfer}
        />
      ) : connectionState === 'pin_required' && pinPrompt ? (
        <PinEntryCard pin={pin} prompt={pinPrompt} onPinChange={onPinChange} onSubmit={onSubmitPin} />
      ) : manifest ? (
        <IncomingFilesCard manifest={manifest} isNativeFSA={isNativeFSA} onStartSaving={onStartSaving} />
      ) : (
        <>
          <RoomCodeForm
            roomCode={roomCode}
            onRoomCodeChange={onRoomCodeChange}
            onConnect={onConnect}
            errorMessage={errorMessage}
          />
          {onSwitchToSend && (
            <div className="text-center">
              <LinkButton onClick={onSwitchToSend}>
                <ArrowLeft className="w-4 h-4" />
                Send files instead
              </LinkButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};
