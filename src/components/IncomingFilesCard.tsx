import React, { useState } from 'react';
import { DownloadCloud, ShieldCheck, AlertTriangle, HardDriveDownload } from 'lucide-react';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { FileTypeIcon } from './ui/FileTypeIcon';
import type { TransferManifest } from '../types/transfer';
import { formatBytes } from '../utils/format';

interface IncomingFilesCardProps {
  manifest: TransferManifest;
  isNativeFSA: boolean;
  onStartSaving: () => void | Promise<void>;
}

/** The sender's offer: what is coming, where it will be stored, and the button that opens the save picker. */
export const IncomingFilesCard: React.FC<IncomingFilesCardProps> = ({ manifest, isNativeFSA, onStartSaving }) => {
  const [isPreparingSave, setIsPreparingSave] = useState(false);
  const isMultiFile = manifest.files.length > 1;

  const handleStartSaveClick = async () => {
    setIsPreparingSave(true);
    try {
      await onStartSaving();
    } finally {
      setIsPreparingSave(false);
    }
  };

  return (
    <div className="rounded-3xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-8 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 flex items-center justify-center">
          <DownloadCloud className="w-6 h-6 motion-safe:animate-float" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
            Incoming Files Ready ({manifest.files.length} {isMultiFile ? 'files' : 'file'})
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Total transfer size:{' '}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatBytes(manifest.totalBytes)}</span>
          </p>
        </div>
      </div>

      <ul className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6 max-h-56 overflow-y-auto space-y-2">
        {manifest.files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-3 text-xs p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60 hover:border-brand-500/30 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_2.5rem]"
          >
            <FileTypeIcon name={file.name} mimeType={file.type} />
            <span className="flex-1 min-w-0 font-semibold text-zinc-800 dark:text-zinc-200 truncate">
              {file.relativePath || file.name}
            </span>
            <span className="font-mono text-zinc-500 dark:text-zinc-400 shrink-0">{formatBytes(file.size)}</span>
          </li>
        ))}
      </ul>

      {/* Only Chromium can stream to disk; elsewhere files are buffered in RAM */}
      {isNativeFSA ? (
        <div className="p-3.5 mb-6 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold block text-zinc-900 dark:text-white">
              Zero-RAM Native Disk Streaming Supported
            </span>
            Clicking below will prompt you to select the save destination. Incoming 64KB chunks will stream direct to
            disk to prevent memory overflows.
          </div>
        </div>
      ) : (
        <div className="p-3.5 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold block text-zinc-900 dark:text-white">This Browser Can’t Stream to Disk</span>
            Each file is held in memory until its download finishes. Files larger than about 1&nbsp;GB may crash this
            tab — use Chrome or Edge for large transfers.
          </div>
        </div>
      )}

      <Button
        size="lg"
        onClick={handleStartSaveClick}
        disabled={isPreparingSave}
        className="w-full rounded-2xl shadow-xl disabled:opacity-75 motion-safe:hover:scale-[1.02]"
      >
        {isPreparingSave ? (
          <>
            <Spinner className="w-5 h-5" />
            <span>{isMultiFile ? 'Opening Folder Dialog…' : 'Opening File Dialog…'}</span>
          </>
        ) : (
          <>
            <HardDriveDownload className="w-5 h-5" />
            <span>{isMultiFile ? 'Select Download Folder' : 'Select Save Location'} & Start Download</span>
          </>
        )}
      </Button>
    </div>
  );
};
