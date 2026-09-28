import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ProgressBar } from './ui/ProgressBar';
import type { FileProgress } from '../utils/transferProgress';

/** Width of a `FileTable` column holding this cell (text + icon, and the bar once the table is wide enough) */
export const FILE_PROGRESS_COLUMN = 'w-21 @xs:w-36';

/**
 * A file's place in a download, at the end of its row: waiting, a bar with its share, or a full bar once done
 * (flagged when it failed verification). Needs an `@container` ancestor; the bar gives way first.
 */
export const FileProgressCell: React.FC<{ progress: FileProgress }> = ({ progress }) => (
  <>
    {(progress.status === 'active' || progress.status === 'done') && (
      <ProgressBar
        percent={progress.status === 'active' ? progress.percent : 100}
        variant="subtle"
        className="hidden @xs:block shrink-0 w-12"
      />
    )}
    <span className="shrink-0 w-14 text-right tabular-nums text-text-4">
      {progress.status === 'active' && <span className="text-brand-500">{Math.round(progress.percent)}%</span>}
      {progress.status === 'pending' && 'Waiting'}
    </span>
    <span className="shrink-0 w-4">
      {progress.status === 'corrupted' && (
        <AlertTriangle className="w-4 h-4 text-text-warning-1" aria-label="Corrupted">
          <title>Corrupted</title>
        </AlertTriangle>
      )}
    </span>
  </>
);
