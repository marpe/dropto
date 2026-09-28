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

const TransferFileRow: React.FC<TransferFileRowProps> = ({ file, progress }) => {
  const hasBar = progress.status === 'active' || progress.status === 'done';
  return (
    <li
      data-status={progress.status}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors duration-300 [content-visibility:auto] [contain-intrinsic-size:auto_2rem]',
        progress.status === 'active' && 'bg-brand-500/5'
      )}
    >
      <FileTypeIcon name={file.name} mimeType={file.type} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-medium',
          progress.status === 'pending' ? 'text-text-5' : progress.status === 'corrupted' ? 'text-text-warning-1' : 'text-text-2'
        )}
      >
        {displayPath(file)}
      </span>
      {/* Size, then the bar, give way first so the name keeps its room on narrow screens */}
      <span className="hidden @sm:inline shrink-0 w-16 text-right tabular-nums text-text-5">{formatBytes(file.size)}</span>
      {hasBar && (
        <ProgressBar
          percent={progress.status === 'active' ? progress.percent : 100}
          variant="subtle"
          className="hidden @xs:block shrink-0 w-12"
        />
      )}
      <span className="shrink-0 min-w-9 text-right tabular-nums text-text-4">
        {progress.status === 'active' && <span className="text-brand-500">{Math.round(progress.percent)}%</span>}
        {(progress.status === 'done' || progress.status === 'corrupted') && formatFileTime(progress.seconds)}
        {progress.status === 'pending' && 'Waiting'}
      </span>
      <span className="shrink-0 w-4">
        {progress.status === 'done' && <CheckCircle2 className="w-4 h-4 text-brand-500" />}
        {progress.status === 'corrupted' && (
          <AlertTriangle className="w-4 h-4 text-text-warning-1" aria-label="Corrupted">
            <title>Corrupted</title>
          </AlertTriangle>
        )}
      </span>
    </li>
  );
};

/** Every file in a transfer with where it stands: waiting, in progress (with its share), done (with how long it took) or corrupted. */
export const TransferFileList: React.FC<TransferFileListProps> = ({ files, progress, className }) => (
  <div className={cn('@container', className)}>
    <ul className="scroll-fade max-h-56 overflow-y-auto overscroll-contain divide-y divide-border-1 text-left">
      {files.map((file, index) => (
        <TransferFileRow key={file.id} file={file} progress={progress[index] ?? { status: 'pending' }} />
      ))}
    </ul>
  </div>
);
