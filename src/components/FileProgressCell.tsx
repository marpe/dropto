import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ProgressBar } from './ui/ProgressBar';
import type { FileProgress } from '../utils/transferProgress';

/** Width of a `FileTable` column holding this cell: the percent (or warning), and the bar once there is room */
export const FILE_PROGRESS_COLUMN = 'w-8 @xs:w-23';

/**
 * A file's place in a download, at the end of its row: an empty bar while it waits, the bar and its percent while
 * it downloads, a full bar once done, or a warning when it failed verification. Needs an `@container` ancestor;
 * the bar gives way first.
 */
export const FileProgressCell: React.FC<{ progress: FileProgress }> = ({ progress }) => (
  <>
    <ProgressBar
      percent={progress.status === 'active' ? progress.percent : progress.status === 'pending' ? 0 : 100}
      variant="subtle"
      className="hidden @xs:block shrink-0 w-12"
    />
    <span className="flex shrink-0 w-8 justify-end tabular-nums text-text-4">
      {progress.status === 'active' && <span className="text-brand-500">{Math.round(progress.percent)}%</span>}
      {progress.status === 'corrupted' && (
        <AlertTriangle className="w-4 h-4 text-text-warning-1" aria-label="Corrupted">
          <title>Corrupted</title>
        </AlertTriangle>
      )}
    </span>
  </>
);
