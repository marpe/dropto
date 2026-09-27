import React from 'react';
import { X } from 'lucide-react';
import { Card } from './ui/Card';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { IconButton } from './ui/IconButton';
import type { TransferFile } from '../types/transfer';
import { formatBytes } from '../utils/format';
import { displayPath } from '../utils/filePath';

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
        {displayPath(file)}
      </span>
      <span className="text-zinc-400 font-mono">{formatBytes(file.size)}</span>
    </div>
    <IconButton
      title={`Remove ${file.name}`}
      size="sm"
      onClick={onRemove}
      className="p-1 hover:text-red-500 dark:hover:text-red-400"
    >
      <X className="w-3.5 h-3.5" />
    </IconButton>
  </li>
);

export const FileQueue: React.FC<FileQueueProps> = ({ files, onRemoveFile, onClearFiles }) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800 mb-3">
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
        </span>
        <button
          type="button"
          onClick={onClearFiles}
          className="shrink-0 text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
        >
          Clear All
        </button>
      </div>

      <ul className="max-h-56 overflow-y-auto overscroll-contain space-y-2 pr-1">
        {files.map((file) => (
          <FileQueueRow key={file.id} file={file} onRemove={() => onRemoveFile(file.id)} />
        ))}
      </ul>
    </Card>
  );
};
