import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { IconButton } from './components/ui/IconButton';
import { DropOverlay } from './components/DropOverlay';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useSenderSession } from './hooks/useSenderSession';
import { useReceiverSession } from './hooks/useReceiverSession';
import { useLeaveGuard } from './hooks/useLeaveGuard';
import { useProgressTitle } from './hooks/useProgressTitle';
import { usePageFileDrop } from './hooks/usePageFileDrop';
import type { ReceiverStatus, SenderStatus } from './types/transfer';
import { parseShareLink, stripShareKeyFromUrl } from './utils/shareLink';
import type { ShareLink } from './utils/shareLink';

type Mode = 'send' | 'receive';

// Files can join the queue until the receiver starts downloading
const CAN_ADD_FILES: SenderStatus[] = ['idle', 'waiting', 'awaiting_receiver'];
// From the room-code form, dropping files means "actually, I want to send"
const CAN_SWITCH_TO_SENDING: ReceiverStatus[] = ['idle', 'error'];

/** Reads the link the page was opened with, then hides its key from the address bar, history and screenshots. */
function readShareLink(): ShareLink {
  const link = parseShareLink(window.location.search, window.location.hash);
  if (link.shareKey) {
    window.history.replaceState(window.history.state, '', stripShareKeyFromUrl(window.location.href));
  }
  return link;
}

const isNativeFSA = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export const App: React.FC = () => {
  const theme = useTheme();
  const [settings, saveSettings] = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shareLink] = useState(readShareLink);
  const [mode, setMode] = useState<Mode>(shareLink.roomCode ? 'receive' : 'send');

  const sender = useSenderSession({ active: mode === 'send', settings });
  const receiver = useReceiverSession({ active: mode === 'receive', settings, shareLink });

  const isTransferring = sender.state.status === 'transferring' || receiver.state.status === 'transferring';
  // Switching modes tears down the other session, including a receiver still choosing where to save
  const isSessionBusy = isTransferring || sender.state.status === 'awaiting_receiver';
  useLeaveGuard(isTransferring);
  const activeMetrics =
    sender.state.status === 'transferring' ? sender.state.metrics : receiver.state.status === 'transferring' ? receiver.state.metrics : null;
  useProgressTitle(activeMetrics ? activeMetrics.overallPercent : null);

  const addDroppedFiles = (files: File[]) => {
    setMode('send');
    sender.actions.addFiles(files);
  };
  const canTakeFiles =
    mode === 'send' ? CAN_ADD_FILES.includes(sender.state.status) : CAN_SWITCH_TO_SENDING.includes(receiver.state.status);
  const { isDraggingFiles } = usePageFileDrop(canTakeFiles ? addDroppedFiles : null);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-supabase-bg dark:text-zinc-100 supabase-glow transition-colors">
      <IconButton
        title="Settings"
        onClick={() => setIsSettingsOpen(true)}
        className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-40"
      >
        <Settings className="w-5 h-5" />
      </IconButton>

      {isDraggingFiles && <DropOverlay />}

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={saveSettings}
          themePreference={theme.preference}
          onThemeChange={theme.setPreference}
        />
      )}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-12 pb-10 sm:pt-20 space-y-8">
        <BrandMark />

        {mode === 'send' ? (
          <SenderView
            roomCode={sender.state.roomCode}
            shareKey={sender.state.shareKey}
            files={sender.state.files}
            onAddFiles={sender.actions.addFiles}
            onRemoveFile={sender.actions.removeFile}
            onClearFiles={sender.actions.clearFiles}
            transferMetrics={sender.state.metrics}
            transferState={sender.state.status}
            pendingPeerId={sender.state.pendingPeerId}
            isPendingPeerTrusted={sender.state.isPendingPeerTrusted}
            onApprovePeer={sender.actions.approvePeer}
            onRejectPeer={sender.actions.rejectPeer}
            onTogglePause={sender.actions.togglePause}
            onCancelTransfer={sender.actions.cancel}
            pin={sender.state.pin}
            onPinChange={sender.actions.setPin}
            corruptedFiles={sender.state.corruptedFiles}
            isPaused={sender.state.isPaused}
            errorMessage={sender.state.error}
            onDismissError={sender.actions.dismissError}
            onRetryRoom={sender.actions.retryRoom}
            onSwitchToReceive={isSessionBusy ? undefined : () => setMode('receive')}
          />
        ) : (
          <ReceiverView
            roomCode={receiver.state.roomCode}
            onRoomCodeChange={receiver.actions.setRoomCode}
            pin={receiver.state.pin}
            onPinChange={receiver.actions.setPin}
            onConnect={receiver.actions.connect}
            connectionState={receiver.state.status}
            pinPrompt={receiver.state.pinPrompt}
            onSubmitPin={receiver.actions.submitPin}
            manifest={receiver.state.manifest}
            transferMetrics={receiver.state.metrics}
            onStartSaving={receiver.actions.startSaving}
            onTogglePause={receiver.actions.togglePause}
            onCancelTransfer={receiver.actions.cancel}
            isPaused={receiver.state.isPaused}
            errorMessage={receiver.state.error}
            isNativeFSA={isNativeFSA}
            corruptedFiles={receiver.state.corruptedFiles}
            onReset={receiver.actions.reset}
            isInvited={receiver.state.isInvited}
            onSwitchToSend={() => setMode('send')}
          />
        )}
      </main>
    </div>
  );
};

export default App;
