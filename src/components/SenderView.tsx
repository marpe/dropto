import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, FolderUp, FileUp, X, QrCode, Copy, Check, Lock, Sparkles } from 'lucide-react';
import type { TransferFile, TransferMetrics } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { MetricsDashboard } from './MetricsDashboard';
import { QrModal } from './QrModal';
import { PeerApprovalModal } from './PeerApprovalModal';
import { fireCelebration } from '../services/confetti';

interface SenderViewProps {
  roomCode: string;
  files: TransferFile[];
  onAddFiles: (newFiles: File[]) => void;
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  connectedPeerId: string | null;
  transferMetrics: TransferMetrics | null;
  transferState: 'idle' | 'waiting' | 'transferring' | 'completed' | 'paused' | 'failed';
  pendingPeer: { peerId: string; approve: () => void; reject: () => void } | null;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  pin: string;
  onPinChange: (newPin: string) => void;
}

export const SenderView: React.FC<SenderViewProps> = ({
  roomCode,
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  connectedPeerId,
  transferMetrics,
  transferState,
  pendingPeer,
  onTogglePause,
  onCancelTransfer,
  pin,
  onPinChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  useEffect(() => {
    if (transferState === 'completed') {
      fireCelebration();
    }
  }, [transferState]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* QR Modal */}
      <QrModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        roomCode={roomCode}
        url={shareUrl}
      />

      {/* Peer Approval Modal */}
      {pendingPeer && (
        <PeerApprovalModal
          isOpen={true}
          peerId={pendingPeer.peerId}
          fileCount={files.length}
          totalBytes={totalSize}
          onApprove={pendingPeer.approve}
          onReject={pendingPeer.reject}
        />
      )}

      {/* Active Transfer State */}
      {transferState === 'transferring' || transferState === 'paused' ? (
        transferMetrics && (
          <MetricsDashboard
            metrics={transferMetrics}
            isSender={true}
            isPaused={transferState === 'paused'}
            onTogglePause={onTogglePause}
            onCancel={onCancelTransfer}
          />
        )
      ) : transferState === 'completed' ? (
        <div className="rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-8 text-center shadow-xl animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/30 text-[#3ECF8E] flex items-center justify-center animate-bounce">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            Transfer Complete!
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            All {files.length} files ({formatBytes(totalSize)}) transferred and verified successfully.
          </p>
          <button
            onClick={onClearFiles}
            className="px-6 py-2.5 rounded-xl font-bold bg-[#3ECF8E] hover:bg-[#24b47e] text-[#121212] shadow-lg shadow-[#3ECF8E]/25 transition-all hover:scale-105"
          >
            Send More Files
          </button>
        </div>
      ) : (
        <>
          {/* File Selection Dropzone with Floating Animation */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
              isDragging
                ? 'border-[#3ECF8E] bg-[#3ECF8E]/10 scale-[1.01] shadow-xl shadow-[#3ECF8E]/10'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-[#3ECF8E]/60 bg-white dark:bg-[#181818]'
            }`}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 text-[#3ECF8E] flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8 animate-float" />
            </div>

            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
              Drag & Drop files or directories here
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
              Up to 10GB+ per file. Direct WebRTC streaming with zero cloud storage.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onAddFiles(Array.from(e.target.files));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#3ECF8E] hover:bg-[#24b47e] text-[#121212] shadow-lg shadow-[#3ECF8E]/25 transition-all hover:scale-105"
              >
                <FileUp className="w-4 h-4" />
                <span>Select Files</span>
              </button>

              <input
                ref={folderInputRef}
                type="file"
                // @ts-ignore: webkitdirectory attribute
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onAddFiles(Array.from(e.target.files));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-all hover:scale-105"
              >
                <FolderUp className="w-4 h-4" />
                <span>Select Folder</span>
              </button>
            </div>
          </div>

          {/* Queued Files List */}
          {files.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-3">
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  Ready to Send ({files.length} {files.length === 1 ? 'file' : 'files'} • {formatBytes(totalSize)})
                </span>
                <button
                  onClick={onClearFiles}
                  className="text-xs text-red-500 hover:text-red-600 font-medium"
                >
                  Clear All
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 text-xs hover:border-[#3ECF8E]/30 transition-colors"
                  >
                    <div className="truncate mr-3">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate">
                        {file.relativePath || file.name}
                      </span>
                      <span className="text-zinc-400 font-mono">{formatBytes(file.size)}</span>
                    </div>
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share & Pair Box */}
          <div className="rounded-3xl bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white">
                  Share with Receiver
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {connectedPeerId ? `Connected to peer (${connectedPeerId})` : 'The receiver needs this 6-digit code or link to establish the direct P2P connection.'}
                </p>
              </div>
              <button
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#3ECF8E]/10 text-[#3ECF8E] hover:bg-[#3ECF8E]/20 transition-all hover:scale-105"
              >
                <QrCode className="w-4 h-4" />
                <span>Show QR</span>
              </button>
            </div>

            {/* Room Code Display */}
            <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-4">
              <div className="flex-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">Room Code</span>
                <span className="font-mono text-2xl font-black tracking-widest text-[#3ECF8E]">
                  {roomCode || 'Generating...'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-[#3ECF8E]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#3ECF8E] hover:bg-[#24b47e] text-[#121212] shadow-sm transition-all hover:scale-105"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Optional Room PIN */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Require Session PIN (Optional)
                </span>
              </div>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. 1234"
                value={pin}
                onChange={(e) => onPinChange(e.target.value)}
                className="w-24 text-center font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:border-[#3ECF8E] focus:outline-none"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
