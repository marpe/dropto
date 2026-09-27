import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { ProgressBar } from './ui/ProgressBar';
import type { ManifestFile } from '../types/transfer';
import type { FileProgress } from '../utils/transferProgress';
import { displayPath } from '../utils/filePath';
import { formatBytes, formatDuration } from '../utils/format';
import { cn } from '../utils/cn';

interface TransferFileListProps {
  files: ManifestFile[];
  progress: FileProgress[];
  className?: string;
}

interface TransferFileRowProps {
  file: ManifestFile;
  progress: FileProgress;
}

/** How long a file took; anything under a second is just "<1s". */
function formatFileTime(seconds: number | null): string {
  if (seconds === null) {
    return '';
  }
  return seconds < 1 ? '<1s' : formatDuration(Math.round(seconds));
}

const TransferFileRow: React.FC<TransferFileRowProps> = ({ file, progress }) => (
  <li
    data-status={progress.status}
    className={cn(
      'flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs border transition-[background-color,border-color] duration-300 [content-visibility:auto] [contain-intrinsic-size:auto_2.25rem]',
      progress.status === 'active'
        ? 'bg-brand-500/5 border-brand-500/30'
        : progress.status === 'corrupted'
          ? 'bg-amber-500/10 border-amber-500/20'
          : 'border-transparent'
    )}
  >
    <FileTypeIcon name={file.name} mimeType={file.type} />
    <span
      className={cn(
        'min-w-0 flex-1 truncate font-medium',
        progress.status === 'pending' ? 'text-text-5' : 'text-text-2'
      )}
    >
      {displayPath(file)}
    </span>
    <span className="shrink-0 font-mono tabular-nums text-text-5">{formatBytes(file.size)}</span>
    <span className="shrink-0 w-28 flex items-center justify-end gap-1.5">
      {progress.status === 'active' && (
        <>
          <ProgressBar percent={progress.percent} variant="subtle" className="w-14" />
          <span className="font-mono tabular-nums text-brand-500">{Math.round(progress.percent)}%</span>
        </>
      )}
      {progress.status === 'done' && (
        <>
          <ProgressBar percent={100} variant="subtle" className="w-10" />
          <span className="w-8 text-right tabular-nums text-text-4">{formatFileTime(progress.seconds)}</span>
          <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-500" />
        </>
      )}
      {progress.status === 'corrupted' && (
        <>
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-text-warning-1 font-semibold">Corrupted</span>
          {progress.seconds !== null && (
            <span className="tabular-nums text-text-4">{formatFileTime(progress.seconds)}</span>
          )}
        </>
      )}
      {progress.status === 'pending' && <span className="text-text-5">Waiting</span>}
    </span>
  </li>
);

/** Every file in a transfer with where it stands: waiting, in progress, done or corrupted. */
export const TransferFileList: React.FC<TransferFileListProps> = ({ files, progress, className }) => (
  <ul className={cn('scroll-fade max-h-56 overflow-y-auto overscroll-contain space-y-1 text-left', className)}>
    {files.map((file, index) => (
      <TransferFileRow key={file.id} file={file} progress={progress[index] ?? { status: 'pending' }} />
    ))}
  </ul>
);
