import type { NamedFile, TransferMetrics } from '../types/transfer';
import { displayPath } from './filePath';

export type FileProgress =
  | { status: 'pending' }
  | { status: 'active'; percent: number }
  | { status: 'done' }
  | { status: 'corrupted' };

/** Per-file status for the progress list; files are transferred strictly in order. */
export function getFileProgress(
  files: NamedFile[],
  metrics: TransferMetrics | null,
  corruptedFiles: string[],
  isCompleted: boolean
): FileProgress[] {
  if (isCompleted) {
    const corrupted = new Set(corruptedFiles);
    return files.map((file) => (corrupted.has(displayPath(file)) ? { status: 'corrupted' } : { status: 'done' }));
  }
  const currentIndex = metrics?.currentFileIndex ?? -1;
  return files.map((_, index) => {
    if (index < currentIndex) {
      return { status: 'done' };
    }
    if (index === currentIndex && metrics) {
      return { status: 'active', percent: metrics.currentFilePercent };
    }
    return { status: 'pending' };
  });
}
