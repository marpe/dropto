import type { NamedFile, TransferMetrics } from '../types/transfer';
import { displayPath } from './filePath';

export type FileProgress =
  | { status: 'pending' }
  | { status: 'active'; percent: number }
  | { status: 'done'; seconds: number | null }
  | { status: 'corrupted'; seconds: number | null };

/** Per-file status for the progress list; files are transferred strictly in order. */
export function getFileProgress(
  files: NamedFile[],
  metrics: TransferMetrics | null,
  corruptedFiles: string[],
  isCompleted: boolean
): FileProgress[] {
  if (isCompleted) {
    const corrupted = new Set(corruptedFiles);
    return files.map((file, index) => ({
      status: corrupted.has(displayPath(file)) ? 'corrupted' : 'done',
      seconds: metrics?.fileSeconds[index] ?? null,
    }));
  }
  const currentIndex = metrics?.currentFileIndex ?? -1;
  return files.map((_, index) => {
    if (index < currentIndex) {
      return { status: 'done', seconds: metrics?.fileSeconds[index] ?? null };
    }
    if (index === currentIndex && metrics) {
      return { status: 'active', percent: metrics.currentFilePercent };
    }
    return { status: 'pending' };
  });
}

/** The final numbers to show for a finished transfer, even one too quick to have reported any. */
export function settledMetrics(metrics: TransferMetrics | null, files: { name: string; size: number }[]): TransferMetrics {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return (
    metrics ?? {
      currentSpeed: 0,
      averageSpeed: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      bytesTransferred: totalBytes,
      totalBytes,
      overallPercent: 100,
      currentFileIndex: Math.max(files.length - 1, 0),
      totalFiles: files.length,
      currentFileName: files.at(-1)?.name ?? '',
      currentFilePercent: 100,
      fileSeconds: [],
    }
  );
}
