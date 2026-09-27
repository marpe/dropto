import React from 'react';
import type { RefObject } from 'react';
import { X } from 'lucide-react';
import { Card } from './ui/Card';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { IconButton } from './ui/IconButton';
import { FilePickerButtons } from './FilePickerButtons';
import type { TransferFile } from '../types/transfer';
import { formatBytes, formatModified } from '../utils/format';
import { displayPath } from '../utils/filePath';
import { cn } from '../utils/cn';

interface FileQueueProps {
  files: TransferFile[];
  onAddFiles: (files: File[]) => void;
  /** Lets other controls (e.g. the approval dialog) open the file picker */
  fileInputRef: RefObject<HTMLInputElement | null>;
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  /** Below the list, e.g. the Share button */
  footer?: React.ReactNode;
}

// One template for the header and every row keeps the columns aligned; "Modified" only when the card is wide enough
const COLUMNS =
  'grid items-center gap-x-3 grid-cols-[1rem_minmax(0,1fr)_4.5rem_1.75rem] @md:grid-cols-[1rem_minmax(0,1fr)_4.5rem_6.5rem_1.75rem]';

interface FileQueueRowProps {
  file: TransferFile;
  onRemove: () => void;
}

const FileQueueRow: React.FC<FileQueueRowProps> = ({ file, onRemove }) => (
  <li
    data-testid="file-row"
    className={cn(
      COLUMNS,
      'px-2.5 py-2 rounded-xl bg-surface-2 border border-border-1 text-xs hover:border-brand-500/30 transition-[border-color,opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1 [content-visibility:auto] [contain-intrinsic-size:auto_2.5rem]'
    )}
  >
    <FileTypeIcon name={file.name} mimeType={file.type} />
    <span className="font-semibold text-text-2 truncate" title={displayPath(file)}>
      {displayPath(file)}
    </span>
    <span className="text-right text-text-4 tabular-nums">{formatBytes(file.size)}</span>
    <span data-testid="file-modified" className="hidden @md:block text-right text-text-5 tabular-nums">
      {formatModified(file.lastModified)}
    </span>
    <IconButton title={`Remove ${file.name}`} size="sm" onClick={onRemove} className="hover:text-text-danger-1 pointer-coarse:-my-1.5">
      <X className="w-4 h-4" />
    </IconButton>
  </li>
);

export const FileQueue: React.FC<FileQueueProps> = ({
  files,
  onAddFiles,
  fileInputRef,
  onRemoveFile,
  onClearFiles,
  footer,
}) => {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-1 mb-3">
        <span className="text-sm font-bold text-text-2 tabular-nums">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
        </span>
        <div className="flex items-center gap-2">
          <FilePickerButtons onAddFiles={onAddFiles} fileInputRef={fileInputRef} size="sm" />
          <button
            type="button"
            onClick={onClearFiles}
            className="ml-1 shrink-0 text-xs text-text-danger-1 font-medium hover:underline"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="@container">
        <div aria-hidden="true" className={cn(COLUMNS, 'px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-text-5')}>
          <span />
          <span>Name</span>
          <span className="text-right">Size</span>
          <span className="hidden @md:block text-right">Modified</span>
          <span />
        </div>
        <ul className="scroll-fade max-h-64 overflow-y-auto overscroll-contain space-y-1.5 pr-1">
          {files.map((file) => (
            <FileQueueRow key={file.id} file={file} onRemove={() => onRemoveFile(file.id)} />
          ))}
        </ul>
      </div>

      {footer && <div className="pt-4 mt-3 border-t border-border-1">{footer}</div>}
    </Card>
  );
};
