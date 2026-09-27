import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { IconButton } from './components/ui/IconButton';
import { DropOverlay } from './components/DropOverlay';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useSenderSession } from './hooks/useSenderSession';
import { countActiveReceivers } from './hooks/senderState';
import { useReceiverSession } from './hooks/useReceiverSession';
import { useLeaveGuard } from './hooks/useLeaveGuard';
import { useProgressTitle } from './hooks/useProgressTitle';
import { usePageFileDrop } from './hooks/usePageFileDrop';
import type { ReceiverStatus, SenderStatus } from './types/transfer';
import { parseShareLink, stripShareKeyFromUrl } from './utils/shareLink';
import { supportsSaveFilePicker } from './utils/fileSystemAccess';
import type { ShareLink } from './utils/shareLink';

type Mode = 'send' | 'receive';

// With one person, files can join the queue until they start downloading; with several, the list is always open
const CAN_ADD_FILES: SenderStatus[] = ['waiting', 'awaiting_receiver'];
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

const isNativeFSA = supportsSaveFilePicker();

export const App: React.FC = () => {
  const theme = useTheme();
  const [settings, saveSettings] = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shareLink] = useState(readShareLink);
  const [mode, setMode] = useState<Mode>(shareLink.roomCode ? 'receive' : 'send');

  const sender = useSenderSession({ active: mode === 'send', settings });
  const receiver = useReceiverSession({ active: mode === 'receive', settings, shareLink });

  const isSenderBusy = countActiveReceivers(sender.state.receivers) > 0;
  const isTransferring =
    sender.state.receivers.some((r) => r.stage === 'transferring') || receiver.state.status === 'transferring';
  // Switching modes tears down the other session, including a receiver still choosing where to save
  const isSessionBusy = isTransferring || isSenderBusy;
  useLeaveGuard(isTransferring);
  // The tab title follows one transfer; with several people downloading there is no single number to show
  const activeMetrics =
    sender.status === 'transferring' ? sender.focus?.metrics : receiver.state.status === 'transferring' ? receiver.state.metrics : null;
  useProgressTitle(activeMetrics ? activeMetrics.overallPercent : null);

  const addDroppedFiles = (files: File[]) => {
    setMode('send');
    sender.actions.addFiles(files);
  };
  const canTakeFiles =
    mode === 'send' ? CAN_ADD_FILES.includes(sender.status) : CAN_SWITCH_TO_SENDING.includes(receiver.state.status);
  const { isDraggingFiles } = usePageFileDrop(canTakeFiles ? addDroppedFiles : null);

  return (
    <div className="min-h-dvh flex flex-col page-glow">
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
        {mode === 'send' ? (
          <SenderView session={sender} onSwitchToReceive={isSessionBusy ? undefined : () => setMode('receive')} />
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
            selectedFileIndices={receiver.state.selectedFileIndices}
            queuePosition={receiver.state.queuePosition}
          />
        )}
      </main>
    </div>
  );
};

export default App;
