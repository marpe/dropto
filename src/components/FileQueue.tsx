import React from 'react';
import { X } from 'lucide-react';
import { FileTypeIcon } from './ui/FileTypeIcon';
import type { TransferFile } from '../types/transfer';
import { formatBytes } from '../utils/format';

interface FileQueueProps {
  files: TransferFile[];
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
}

interface FileQueueRowProps {
  file: TransferFile;
  onRemove: () => void;
}

const FileQueueRow: React.FC<FileQueueRowProps> = ({ file, onRemove }) => (
  <li className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 text-xs hover:border-brand-500/30 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_3.25rem]">
    <FileTypeIcon name={file.name} mimeType={file.type} />
    <div className="min-w-0 flex-1">
      <span className="font-semibold text-zinc-800 dark:text-zinc-200 block truncate">
        {file.relativePath || file.name}
      </span>
      <span className="text-zinc-400 font-mono">{formatBytes(file.size)}</span>
    </div>
    <button
      type="button"
      onClick={onRemove}
      title={`Remove ${file.name}`}
      className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  </li>
);

export const FileQueue: React.FC<FileQueueProps> = ({ files, onRemoveFile, onClearFiles }) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="rounded-2xl bg-white dark:bg-supabase-surface border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-3">
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
          Ready to Send ({files.length} {files.length === 1 ? 'file' : 'files'} • {formatBytes(totalBytes)})
        </span>
        <button
          type="button"
          onClick={onClearFiles}
          className="shrink-0 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
        >
          Clear All
        </button>
      </div>

      <ul className="max-h-56 overflow-y-auto space-y-2 pr-1">
        {files.map((file) => (
          <FileQueueRow key={file.id} file={file} onRemove={() => onRemoveFile(file.id)} />
        ))}
      </ul>
    </div>
  );
};
