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
  /** Below the list, e.g. the step's main action */
  footer?: React.ReactNode;
}

interface FileQueueRowProps {
  file: TransferFile;
  onRemove: () => void;
}

const FileQueueRow: React.FC<FileQueueRowProps> = ({ file, onRemove }) => (
  <li className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-border-1 text-xs hover:border-brand-500/30 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_3.25rem]">
    <FileTypeIcon name={file.name} mimeType={file.type} />
    <div className="min-w-0 flex-1">
      <span className="font-semibold text-text-2 block truncate">
        {displayPath(file)}
      </span>
      <span className="text-text-5 font-mono">{formatBytes(file.size)}</span>
    </div>
    <IconButton
      title={`Remove ${file.name}`}
      size="sm"
      onClick={onRemove}
      className="hover:text-text-danger-1 pointer-coarse:-my-1.5"
    >
      <X className="w-4 h-4" />
    </IconButton>
  </li>
);

export const FileQueue: React.FC<FileQueueProps> = ({ files, onRemoveFile, onClearFiles, footer }) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border-1 mb-3">
        <span className="text-sm font-bold text-text-2">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
        </span>
        <button
          type="button"
          onClick={onClearFiles}
          className="shrink-0 text-xs text-text-danger-1 hover:text-text-danger-1 font-medium transition-colors"
        >
          Clear All
        </button>
      </div>

      <ul className="scroll-fade max-h-56 overflow-y-auto overscroll-contain space-y-2 pr-1">
        {files.map((file) => (
          <FileQueueRow key={file.id} file={file} onRemove={() => onRemoveFile(file.id)} />
        ))}
      </ul>

      {footer && <div className="pt-4 mt-3 border-t border-border-1">{footer}</div>}
    </Card>
  );
};
