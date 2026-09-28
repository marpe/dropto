import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { IconButton } from './components/ui/IconButton';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { AppBar } from './components/ui/AppBar';
import { DropOverlay } from './components/DropOverlay';
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useSenderSession } from './hooks/useSenderSession';
import { countActiveReceivers } from './hooks/senderState';
import { describeLeaveCost } from './hooks/leaveCost';
import { useReceiverSession } from './hooks/useReceiverSession';
import { useLeaveGuard } from './hooks/useLeaveGuard';
import { useProgressTitle } from './hooks/useProgressTitle';
import { usePageFileDrop } from './hooks/usePageFileDrop';
import type { AddFiles, ReceiverStatus, SenderStatus } from './types/transfer';
import { parseShareLink, stripShareKeyFromUrl } from './utils/shareLink';
import type { ShareLink } from './utils/shareLink';
import { getActiveBrand } from './branding';

type Mode = 'send' | 'receive';

// With one person, files can join the queue until they start downloading; with several, the list is always open
const CAN_ADD_FILES: SenderStatus[] = ['waiting', 'awaiting_receiver'];
// From the room-code form, dropping files means "actually, I want to send"
const CAN_SWITCH_TO_SENDING: ReceiverStatus[] = ['idle', 'error'];
// Back is also offered once a download is done: leaving then loses nothing
const CAN_LEAVE_RECEIVING: ReceiverStatus[] = [...CAN_SWITCH_TO_SENDING, 'completed'];

/** Reads the link the page was opened with, then hides its key from the address bar, history and screenshots. */
function readShareLink(): ShareLink {
  const link = parseShareLink(window.location.search, window.location.hash);
  if (link.shareKey) {
    window.history.replaceState(window.history.state, '', stripShareKeyFromUrl(window.location.href));
  }
  return link;
}

export const App: React.FC = () => {
  const theme = useTheme();
  const [settings, saveSettings] = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConfirmingHome, setIsConfirmingHome] = useState(false);
  const [shareLink] = useState(readShareLink);
  const [mode, setMode] = useState<Mode>(shareLink.roomCode ? 'receive' : 'send');

  const sender = useSenderSession({ active: mode === 'send', settings });
  const receiver = useReceiverSession({ active: mode === 'receive', settings, shareLink });

  const isSenderBusy = countActiveReceivers(sender.state.receivers) > 0;
  const isTransferring =
    sender.state.receivers.some((r) => r.stage === 'transferring' || r.stage === 'interrupted') || receiver.state.status === 'transferring';
  // Switching modes tears down the other session, including a receiver still choosing where to save
  const isSessionBusy = isTransferring || isSenderBusy;
  useLeaveGuard(isTransferring);
  // The tab title follows one transfer; with several people downloading there is no single number to show
  const activeMetrics =
    sender.status === 'transferring' ? sender.focus?.metrics : receiver.state.status === 'transferring' ? receiver.state.metrics : null;
  useProgressTitle(activeMetrics ? activeMetrics.overallPercent : null);

  const addDroppedFiles: AddFiles = (files) => {
    setMode('send');
    sender.actions.addFiles(files);
  };
  const canTakeFiles =
    mode === 'send' ? CAN_ADD_FILES.includes(sender.status) : CAN_SWITCH_TO_SENDING.includes(receiver.state.status);
  const { isDraggingFiles } = usePageFileDrop(canTakeFiles ? addDroppedFiles : null);
  // Leaving mid-connection would tear it down; back is offered from the code form, its errors and after a download
  const canLeaveReceiving = CAN_LEAVE_RECEIVING.includes(receiver.state.status);

  const leaveCost = describeLeaveCost({
    mode,
    isShared: sender.state.isShared,
    receivers: sender.state.receivers,
    receiverStatus: receiver.state.status,
  });
  // The title leads back to the empty Send page, whatever was going on
  const goHome = () => {
    setIsConfirmingHome(false);
    sender.actions.startOver();
    receiver.actions.reset();
    setMode('send');
  };
  const requestHome = () => {
    if (leaveCost) {
      setIsConfirmingHome(true);
    } else {
      goHome();
    }
  };

  return (
    // Phone: a full-screen app. Desktop: a small utility panel centred on a plain background
    <div className="min-h-dvh bg-background sm:py-16">
      <div className="flex flex-col min-h-dvh sm:min-h-0 sm:max-w-[30rem] sm:mx-auto sm:rounded-xl sm:overflow-clip">
      <AppBar
        title={getActiveBrand().name}
        onTitleClick={requestHome}
        onBack={mode === 'receive' && canLeaveReceiving ? () => setMode('send') : undefined}
        backLabel="Send files instead"
        actions={
          <IconButton title="Settings" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="w-5 h-5" />
          </IconButton>
        }
      />

      {isDraggingFiles && <DropOverlay />}

      {isConfirmingHome && leaveCost && (
        <ConfirmDialog
          title={leaveCost.title}
          confirmLabel={leaveCost.confirmLabel}
          tone="danger"
          onConfirm={goHome}
          onCancel={() => setIsConfirmingHome(false)}
        >
          <p>{leaveCost.body}</p>
        </ConfirmDialog>
      )}

      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={saveSettings}
          themePreference={theme.preference}
          onThemeChange={theme.setPreference}
        />
      )}

      {/* Room at the bottom on a phone for the pinned action bar, when there is one */}
      <main className="flex-1 pt-4 pb-4 has-[[data-bottom-bar]]:pb-28 sm:py-0 sm:has-[[data-bottom-bar]]:pb-0">
        {mode === 'send' ? (
          <SenderView session={sender} onSwitchToReceive={isSessionBusy ? undefined : () => setMode('receive')} />
        ) : (
          <ReceiverView session={receiver} />
        )}
      </main>
      </div>
    </div>
  );
};

export default App;
