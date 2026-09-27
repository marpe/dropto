import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { ModeSwitch } from './components/ModeSwitch';
import type { Mode } from './components/ModeSwitch';
import { useDarkMode } from './hooks/useDarkMode';
import { useSettings } from './hooks/useSettings';
import { useSenderSession } from './hooks/useSenderSession';
import { useReceiverSession } from './hooks/useReceiverSession';
import { useLeaveGuard } from './hooks/useLeaveGuard';
import { useProgressTitle } from './hooks/useProgressTitle';
import { parseShareLink, stripShareKeyFromUrl } from './utils/shareLink';
import type { ShareLink } from './utils/shareLink';


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
  const [darkMode, toggleDarkMode] = useDarkMode();
  const [settings, saveSettings] = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [shareLink] = useState(readShareLink);
  const [mode, setMode] = useState<Mode>(shareLink.roomCode ? 'receive' : 'send');

  const sender = useSenderSession({ active: mode === 'send', settings });
  const receiver = useReceiverSession({ active: mode === 'receive', settings, shareLink });

  const isTransferring = sender.state.status === 'transferring' || receiver.state.status === 'transferring';
  // A receiver choosing where to save would be dropped by a mode switch too
  const isSessionBusy = isTransferring || sender.state.status === 'awaiting_receiver';
  useLeaveGuard(isTransferring);
  const activeMetrics =
    sender.state.status === 'transferring' ? sender.state.metrics : receiver.state.status === 'transferring' ? receiver.state.metrics : null;
  useProgressTitle(activeMetrics ? activeMetrics.overallPercent : null);
  const isConnected =
    !!sender.state.connectedPeerId || ['waiting_approval', 'pin_required', 'verifying_pin', 'connected', 'transferring'].includes(receiver.state.status);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-supabase-bg dark:text-zinc-100 supabase-glow transition-colors">
      <Header
        darkMode={darkMode}
        onToggleTheme={toggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        connected={isConnected}
      />

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={saveSettings} />
      )}

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {/* Switching modes tears down the other session, so it is hidden mid-transfer */}
        {!isSessionBusy && (
          <div className="flex justify-center mb-8">
            <ModeSwitch mode={mode} onChange={setMode} />
          </div>
        )}

        <div className="transition-opacity duration-300">
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
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;
