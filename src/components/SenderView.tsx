import React, { useRef, useState } from 'react';
import { UploadCloud, FolderUp, FileUp, X, QrCode, Copy, Check, Lock, Sparkles } from 'lucide-react';
import type { TransferFile, TransferMetrics } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { MetricsDashboard } from './MetricsDashboard';
import { QrModal } from './QrModal';
import { PeerApprovalModal } from './PeerApprovalModal';

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
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Transfer Complete!
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            All {files.length} files ({formatBytes(totalSize)}) transferred and verified successfully.
          </p>
          <button
            onClick={onClearFiles}
            className="px-6 py-2.5 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
          >
            Send More Files
          </button>
        </div>
      ) : (
        <>
          {/* File Selection Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[1.01]'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50'
            }`}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Drag & Drop files or directories here
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all"
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
              >
                <FolderUp className="w-4 h-4" />
                <span>Select Folder</span>
              </button>
            </div>
          </div>

          {/* Queued Files List */}
          {files.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
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
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs"
                  >
                    <div className="truncate mr-3">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate">
                        {file.relativePath || file.name}
                      </span>
                      <span className="text-slate-400 font-mono">{formatBytes(file.size)}</span>
                    </div>
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share & Pair Box */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white">
                  Share with Receiver
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {connectedPeerId ? `Connected to peer (${connectedPeerId})` : 'The receiver needs this 6-digit code or link to establish the direct P2P connection.'}
                </p>
              </div>
              <button
                onClick={() => setIsQrOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
              >
                <QrCode className="w-4 h-4" />
                <span>Show QR</span>
              </button>
            </div>

            {/* Room Code Display */}
            <div className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 mb-4">
              <div className="flex-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Room Code</span>
                <span className="font-mono text-2xl font-black tracking-widest text-indigo-600 dark:text-indigo-400">
                  {roomCode || 'Generating...'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Optional Room PIN */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Require Session PIN (Optional)
                </span>
              </div>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. 1234"
                value={pin}
                onChange={(e) => onPinChange(e.target.value)}
                className="w-24 text-center font-mono text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
