import React from 'react';
import { formatBytes } from '../utils/format';
import { cn } from '../utils/cn';

interface FileTotalsProps {
  /** Files counted, e.g. the ticked ones */
  count: number;
  /** When only some are counted: how many there are in all, shown as "2 of 5 files" */
  ofCount?: number;
  totalBytes: number;
  className?: string;
}

/** "3 files · 12 MB" under a file list; "2 of 5 files" while only some are chosen. */
export const FileTotals: React.FC<FileTotalsProps> = ({ count, ofCount, totalBytes, className }) => {
  const isPartial = ofCount !== undefined && ofCount !== count;
  const noun = (isPartial ? ofCount : count) === 1 ? 'file' : 'files';
  return (
    <span data-testid="file-totals" className={cn('flex items-center gap-2 text-xs text-text-3 tabular-nums', className)}>
      <span className="font-semibold">{isPartial ? `${count} of ${ofCount} ${noun}` : `${count} ${noun}`}</span>
      <span>·</span>
      <span className="font-semibold text-text-muted">{formatBytes(totalBytes)}</span>
    </span>
  );
};
