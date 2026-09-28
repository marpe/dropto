import type { FinishedFile, ManifestFile, NamedFile, TransferMetrics, TransferResult } from '../types/transfer';
import type { SenderReceiver } from '../types/sharing';
import { displayPath } from './filePath';
import { pickFiles } from './fileSelection';

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

/** A download under way: which offered files it covers (null = all of them) and how far it got. */
export interface ActiveDownload {
  fileIndices: number[] | null;
  metrics: TransferMetrics | null;
}

/**
 * Where each offered file stands: live progress when it is in the running download, its result when it
 * was downloaded earlier on this connection, otherwise null.
 */
export function getOfferedFileProgress<T extends NamedFile & { id: string }>(
  files: T[],
  download: ActiveDownload | null,
  finishedFiles: Record<string, FinishedFile>
): (FileProgress | null)[] {
  const live = download ? getFileProgress(pickFiles(files, download.fileIndices), download.metrics, [], false) : [];
  const positions = new Map((download ? (download.fileIndices ?? files.map((_, index) => index)) : []).map((index, position) => [index, position]));
  return files.map((file, index) => {
    const position = positions.get(index);
    if (position !== undefined) {
      return live[position];
    }
    const finished = finishedFiles[file.id];
    return finished ? { status: finished.isCorrupted ? 'corrupted' : 'done', seconds: finished.seconds } : null;
  });
}

/** Each file of a download that just finished, by id, with how long it took and whether it arrived intact. */
export function finishedFilesOf<T extends NamedFile & { id: string }>(
  files: T[],
  metrics: TransferMetrics | null,
  result: TransferResult
): Record<string, FinishedFile> {
  const corrupted = new Set(result.corruptedFiles);
  return Object.fromEntries(
    files.map((file, position) => [
      file.id,
      { seconds: metrics?.fileSeconds[position] ?? null, isCorrupted: corrupted.has(displayPath(file)) },
    ])
  );
}

/**
 * What one receiver got from the sender: every file it finished downloading on this connection, then any
 * new ones in the download under way, each with its progress. Files it never asked for are left out.
 */
export function getSentFiles(receiver: SenderReceiver): { files: ManifestFile[]; progress: (FileProgress | null)[] } {
  const isDownloading = receiver.stage === 'transferring' || receiver.stage === 'interrupted';
  const sentIds = new Set(receiver.sentFiles.map((file) => file.id));
  const files = isDownloading
    ? [...receiver.sentFiles, ...receiver.downloadFiles.filter((file) => !sentIds.has(file.id))]
    : receiver.sentFiles;
  const positions = new Map(files.map((file, index) => [file.id, index]));
  const download = isDownloading
    ? { fileIndices: receiver.downloadFiles.flatMap((file) => positions.get(file.id) ?? []), metrics: receiver.metrics }
    : null;
  return { files, progress: getOfferedFileProgress(files, download, receiver.finishedFiles) };
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
