import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { useDarkMode } from './hooks/useDarkMode';
import { useSettings } from './hooks/useSettings';
import { useSenderSession } from './hooks/useSenderSession';
import { useReceiverSession } from './hooks/useReceiverSession';

type Mode = 'send' | 'receive';

/** Room code from a ?room=DW-XXXXXX share link, if the page was opened through one. */
function getSharedRoomCode(): string {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
}

const isNativeFSA = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export const App: React.FC = () => {
  const [darkMode, toggleDarkMode] = useDarkMode();
  const [settings, saveSettings] = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sharedRoomCode] = useState(getSharedRoomCode);
  const [mode, setMode] = useState<Mode>(sharedRoomCode ? 'receive' : 'send');

  const sender = useSenderSession({ active: mode === 'send', settings });
  const receiver = useReceiverSession({ active: mode === 'receive', settings, initialRoomCode: sharedRoomCode });

  const isTransferring = sender.state.status === 'transferring' || receiver.state.status === 'transferring';
  const isConnected =
    !!sender.state.connectedPeerId || ['waiting_approval', 'connected', 'transferring'].includes(receiver.state.status);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-[#121212] dark:text-zinc-100 supabase-glow transition-colors">
      <Header
        darkMode={darkMode}
        onToggleTheme={toggleDarkMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        connected={isConnected}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={saveSettings}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {/* Switching modes tears down the other session, so it is hidden mid-transfer */}
        {!isTransferring && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1 rounded-2xl bg-zinc-200/80 dark:bg-[#181818] border border-zinc-300/60 dark:border-zinc-800">
              {(['send', 'receive'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setMode(option)}
                  className={`py-2 px-6 rounded-xl text-sm font-bold transition-all ${
                    mode === option
                      ? 'bg-[#3ECF8E] text-[#121212] shadow-md shadow-[#3ECF8E]/20'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {option === 'send' ? 'Send Files' : 'Receive Files'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="transition-opacity duration-300">
          {mode === 'send' ? (
            <SenderView
              roomCode={sender.state.roomCode}
              files={sender.state.files}
              onAddFiles={sender.actions.addFiles}
              onRemoveFile={sender.actions.removeFile}
              onClearFiles={sender.actions.clearFiles}
              connectedPeerId={sender.state.connectedPeerId}
              transferMetrics={sender.state.metrics}
              transferState={sender.state.status}
              pendingPeerId={sender.state.pendingPeerId}
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
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;
