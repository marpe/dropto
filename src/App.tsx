import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { SettingsModal } from './components/SettingsModal';
import { webrtcService } from './services/webrtc';
import { transferEngine } from './services/transferEngine';
import { soundService } from './services/sound';
import { wakeLockService } from './services/wakeLock';
import type { AppSettings, TransferFile, TransferManifest, TransferMetrics } from './types/transfer';

const DEFAULT_SETTINGS: AppSettings = {
  useCustomSignaling: false,
  signalingHost: '',
  signalingPort: 9000,
  signalingPath: '/',
  signalingSecure: true,
  customStunTurn: [],
  chunkSize: 64 * 1024,
  enableAudioAlerts: true,
  enableWakeLock: true,
};

export const App: React.FC = () => {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('dropwave_settings');
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App mode: Send or Receive
  const [mode, setMode] = useState<'send' | 'receive'>('send');

  // Sender state
  const [senderRoomCode, setSenderRoomCode] = useState<string>('');
  const [senderFiles, setSenderFiles] = useState<TransferFile[]>([]);
  const [senderPin, setSenderPin] = useState<string>('');
  const senderFilesRef = React.useRef<TransferFile[]>(senderFiles);
  senderFilesRef.current = senderFiles;
  const senderPinRef = React.useRef<string>(senderPin);
  senderPinRef.current = senderPin;
  const [connectedPeerId, setConnectedPeerId] = useState<string | null>(null);
  const [pendingPeer, setPendingPeer] = useState<{
    peerId: string;
    approve: () => void;
    reject: () => void;
  } | null>(null);

  // Receiver state
  const [receiverRoomCode, setReceiverRoomCode] = useState<string>('');
  const [receiverPin, setReceiverPin] = useState<string>('');
  const [receiverState, setReceiverState] = useState<
    'idle' | 'connecting' | 'waiting_approval' | 'connected' | 'transferring' | 'completed' | 'error'
  >('idle');
  const [manifest, setManifest] = useState<TransferManifest | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transfer shared state
  const [transferState, setTransferState] = useState<
    'idle' | 'waiting' | 'transferring' | 'completed' | 'paused' | 'failed'
  >('idle');
  const [metrics, setMetrics] = useState<TransferMetrics | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const isNativeFSA = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

  // Sync dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', 'light');
    }
  }, [darkMode]);

  // Sync settings
  useEffect(() => {
    soundService.enabled = settings.enableAudioAlerts;
  }, [settings]);

  // Check URL query parameters for ?room=DW-XXXXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setMode('receive');
      setReceiverRoomCode(roomParam.toUpperCase());
    }
  }, []);

  // Initialize sender room when in 'send' mode
  const initSenderSession = useCallback(async () => {
    try {
      setTransferState('waiting');
      const code = await webrtcService.initSender(settings);
      setSenderRoomCode(code);

      webrtcService.setHandlers({
        onIncomingConnection: (conn) => {
          soundService.playConnect();
          // Prompt sender for approval
          setPendingPeer({
            peerId: conn.peer,
            approve: () => {
              setPendingPeer(null);
              setConnectedPeerId(conn.peer);
              setTransferState('transferring');

              transferEngine.init(conn, true, {
                onMetrics: (m) => setMetrics({ ...m }),
                onFileStart: (_f, _idx) => {},
                onFileComplete: (_idx, _verified) => {},
                onAllCompleted: () => {
                  setTransferState('completed');
                  wakeLockService.release();
                },
                onError: (err) => {
                  console.error('Engine error:', err);
                  setTransferState('failed');
                  wakeLockService.release();
                },
                onPaused: (paused) => setIsPaused(paused),
                onCancelled: () => {
                  setTransferState('waiting');
                  setMetrics(null);
                },
              });

              // Start transferring selected files using current ref
              transferEngine.startSenderTransfer(senderFilesRef.current, !!senderPinRef.current);
            },
            reject: () => {
              setPendingPeer(null);
              conn.close();
            },
          });
        },
        onDisconnected: () => {
          setConnectedPeerId(null);
          if (transferState === 'transferring') {
            setTransferState('failed');
            setErrorMessage('Peer disconnected unexpectedly');
          }
        },
        onError: (err) => {
          console.error('WebRTC error:', err);
        },
      });
    } catch (err: any) {
      console.error('Failed to init sender:', err);
    }
  }, [settings, senderFiles, senderPin, transferState]);

  useEffect(() => {
    if (mode === 'send') {
      initSenderSession();
    } else {
      webrtcService.destroy();
      setSenderRoomCode('');
      setConnectedPeerId(null);
    }
    return () => {
      webrtcService.destroy();
    };
  }, [mode]);

  // Handle adding files to sender queue
  const handleAddFiles = (newFiles: File[]) => {
    const formatted: TransferFile[] = newFiles.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      relativePath: (file as any).webkitRelativePath || undefined,
      lastModified: file.lastModified,
      rawFile: file,
      chunkSize: settings.chunkSize,
      totalChunks: Math.ceil(file.size / settings.chunkSize),
      status: 'pending',
      bytesTransferred: 0,
    }));

    setSenderFiles((prev) => [...prev, ...formatted]);
  };

  const handleRemoveFile = (fileId: string) => {
    setSenderFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleClearFiles = () => {
    setSenderFiles([]);
    setTransferState('waiting');
    setMetrics(null);
  };

  // Receiver Connect
  const handleReceiverConnect = async () => {
    if (!receiverRoomCode.trim()) return;

    setReceiverState('connecting');
    setErrorMessage(null);

    try {
      const conn = await webrtcService.initReceiver(receiverRoomCode.trim(), settings);
      setReceiverState('connected');
      soundService.playConnect();

      transferEngine.init(conn, false, {
        onMetrics: (m) => setMetrics({ ...m }),
        onFileStart: (_f, _idx) => {
          // Received manifest
          if ((transferEngine as any).manifest) {
            setManifest({ ...(transferEngine as any).manifest });
          }
        },
        onFileComplete: (_idx, verified) => {
          if (!verified) {
            console.warn('Checksum mismatch on downloaded file');
          }
        },
        onAllCompleted: () => {
          setReceiverState('completed');
          wakeLockService.release();
        },
        onError: (err) => {
          setReceiverState('error');
          setErrorMessage(err);
          wakeLockService.release();
        },
        onPaused: (paused) => setIsPaused(paused),
        onCancelled: () => {
          setReceiverState('error');
          setErrorMessage('The sender cancelled the transfer.');
          setManifest(null);
          setMetrics(null);
        },
      });
    } catch (err: any) {
      setReceiverState('error');
      setErrorMessage(err.message || 'Failed to establish connection to peer room. Verify room code.');
    }
  };

  // Receiver prompts save dialog & begins streaming chunks
  const handleReceiverStartSaving = async () => {
    setReceiverState('transferring');
    const started = await transferEngine.startReceiving();
    if (!started) {
      setReceiverState('connected');
    }
  };

  const handleTogglePause = () => {
    const nextPaused = transferEngine.togglePause();
    setIsPaused(nextPaused);
  };

  const handleCancelTransfer = () => {
    transferEngine.cancel();
    setTransferState('idle');
    setReceiverState('idle');
    setManifest(null);
    setMetrics(null);
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('dropwave_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-[#121212] dark:text-zinc-100 supabase-glow transition-colors">
      <Header
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode(!darkMode)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        connected={!!connectedPeerId || receiverState === 'connected' || receiverState === 'transferring'}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {/* Send / Receive Mode Switcher */}
        {transferState !== 'transferring' && receiverState !== 'transferring' && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex p-1 rounded-2xl bg-zinc-200/80 dark:bg-[#181818] border border-zinc-300/60 dark:border-zinc-800">
              <button
                onClick={() => setMode('send')}
                className={`py-2 px-6 rounded-xl text-sm font-bold transition-all ${
                  mode === 'send'
                    ? 'bg-[#3ECF8E] text-[#121212] shadow-md shadow-[#3ECF8E]/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Send Files
              </button>
              <button
                onClick={() => setMode('receive')}
                className={`py-2 px-6 rounded-xl text-sm font-bold transition-all ${
                  mode === 'receive'
                    ? 'bg-[#3ECF8E] text-[#121212] shadow-md shadow-[#3ECF8E]/20'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Receive Files
              </button>
            </div>
          </div>
        )}

        {/* View Rendering with Fade Animation */}
        <div className="transition-opacity duration-300">
          {mode === 'send' ? (
            <SenderView
              roomCode={senderRoomCode}
              files={senderFiles}
              onAddFiles={handleAddFiles}
              onRemoveFile={handleRemoveFile}
              onClearFiles={handleClearFiles}
              connectedPeerId={connectedPeerId}
              transferMetrics={metrics}
              transferState={transferState}
              pendingPeer={pendingPeer}
              onTogglePause={handleTogglePause}
              onCancelTransfer={handleCancelTransfer}
              pin={senderPin}
              onPinChange={setSenderPin}
            />
          ) : (
            <ReceiverView
              roomCode={receiverRoomCode}
              onRoomCodeChange={setReceiverRoomCode}
              pin={receiverPin}
              onPinChange={setReceiverPin}
              onConnect={handleReceiverConnect}
              connectionState={receiverState}
              manifest={manifest}
              transferMetrics={metrics}
              onStartSaving={handleReceiverStartSaving}
              onTogglePause={handleTogglePause}
              onCancelTransfer={handleCancelTransfer}
              isPaused={isPaused}
              errorMessage={errorMessage}
              isNativeFSA={isNativeFSA}
            />
          )}
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800/80">
        <div>
          DropWave • Browser-only WebRTC P2P Transfer • Files never touch an intermediate server
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/marpe/send"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-[#3ECF8E] transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub (marpe/send)</span>
          </a>
        </div>
      </footer>
    </div>
  );
};

export default App;
