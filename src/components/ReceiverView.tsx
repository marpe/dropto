import React from 'react';
import { ArrowLeft } from 'lucide-react';
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
  onStartSaving: () => void | Promise<void>;
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
}

function getWaitingStage(
  status: ReceiverStatus,
  isInvited: boolean,
  manifest: TransferManifest | null
): WaitingStage | null {
  if (status === 'verifying_pin') {
    return 'pin';
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
}) => {
  const waitingStage = getWaitingStage(connectionState, isInvited, manifest);

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* Active Transfer State */}
      {connectionState === 'transferring' ? (
        transferMetrics ? (
          <MetricsDashboard
            metrics={transferMetrics}
            files={manifest?.files ?? []}
            isSender={false}
            isPaused={isPaused}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        ) : (
          <StatusCard
            badge={<Spinner className="w-10 h-10 border-[3px] text-brand-500" />}
            title="Preparing Stream to Disk…"
            description="Waiting for you to pick a save location, then for the first data to arrive."
          />
        )
      ) : connectionState === 'completed' ? (
        <TransferCompleteCard
          title="Download Complete & Verified!"
          actionLabel="Receive More Files"
          onAction={onReset}
          files={manifest?.files ?? []}
          metrics={transferMetrics}
          corruptedFiles={corruptedFiles}
        />
      ) : waitingStage ? (
        <WaitingForSenderCard stage={waitingStage} roomCode={roomCode} onCancel={onCancelTransfer} />
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
            isConnecting={connectionState === 'connecting'}
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
