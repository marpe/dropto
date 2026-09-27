import React, { useState } from 'react';
import type { RefObject } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
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

type SortKey = 'name' | 'size' | 'modified';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const COMPARE: Record<SortKey, (a: TransferFile, b: TransferFile) => number> = {
  name: (a, b) => displayPath(a).localeCompare(displayPath(b), undefined, { numeric: true, sensitivity: 'base' }),
  size: (a, b) => a.size - b.size,
  modified: (a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0),
};

/** Display order only: files are still sent in the order they were added. */
function sortFiles(files: TransferFile[], sort: Sort | null): TransferFile[] {
  if (!sort) {
    return files;
  }
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...files].sort((a, b) => sign * COMPARE[sort.key](a, b));
}

/** Ascending, then descending, then back to the order the files were added. */
function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current?.key !== key) {
    return { key, direction: 'asc' };
  }
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

// One template for the header and every row keeps the columns aligned; "Modified" only when the card is wide enough
const COLUMNS =
  'grid items-center gap-x-3 grid-cols-[1rem_minmax(0,1fr)_4.5rem_1.75rem] @md:grid-cols-[1rem_minmax(0,1fr)_4.5rem_6.5rem_1.75rem]';

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  className?: string;
}

const SortHeader: React.FC<SortHeaderProps> = ({ label, sortKey, sort, onSort, className }) => {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const Arrow = direction === 'desc' ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 uppercase tracking-wider hover:text-text-2 transition-colors',
        direction && 'text-text-3',
        className
      )}
    >
      {label}
      <Arrow className={cn('w-3 h-3', !direction && 'invisible')} />
    </button>
  );
};

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
  const [sort, setSort] = useState<Sort | null>(null);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const onSort = (key: SortKey) => setSort((current) => nextSort(current, key));

  return (
    <Card padding="sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-text-1">Send files</h2>
        <button
          type="button"
          onClick={onClearFiles}
          className="shrink-0 text-xs text-text-danger-1 font-medium hover:underline"
        >
          Clear all
        </button>
      </div>

      <div className="@container">
        <div className={cn(COLUMNS, 'px-2.5 pb-1.5 text-2xs font-semibold text-text-5')}>
          <span />
          <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} className="justify-self-start" />
          <SortHeader label="Size" sortKey="size" sort={sort} onSort={onSort} className="justify-self-end" />
          <SortHeader label="Modified" sortKey="modified" sort={sort} onSort={onSort} className="hidden @md:inline-flex justify-self-end" />
          <span />
        </div>
        <ul className="scroll-fade max-h-64 overflow-y-auto overscroll-contain space-y-1.5 pr-1">
          {sortFiles(files, sort).map((file) => (
            <FileQueueRow key={file.id} file={file} onRemove={() => onRemoveFile(file.id)} />
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <span className="text-xs font-semibold text-text-3 tabular-nums">
          {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
        </span>
        <div className="flex items-center gap-2">
          <FilePickerButtons onAddFiles={onAddFiles} fileInputRef={fileInputRef} size="sm" />
        </div>
      </div>

      {footer && <div className="pt-4 mt-3 border-t border-border-1">{footer}</div>}
    </Card>
  );
};
