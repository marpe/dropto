import type { ManifestFile } from '../types/transfer';
import { displayPath } from './filePath';

export const SENDER_FILES_STORAGE_KEY = 'sender-files';

/** Same path, size and modification time: the same file, picked or dropped twice or again after a reload. */
export function fileIdentity(file: Pick<ManifestFile, 'name' | 'relativePath' | 'size' | 'lastModified'>): string {
  return `${displayPath(file)}|${file.size}|${file.lastModified}`;
}

/** Only what describes a file; its contents never leave the page. */
function describeFile({ id, name, size, type, relativePath, lastModified }: ManifestFile): ManifestFile {
  return { id, name, size, type, relativePath, lastModified };
}

function isRememberedFile(value: unknown): value is ManifestFile {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === 'string' &&
    typeof file.name === 'string' &&
    typeof file.size === 'number' &&
    typeof file.type === 'string' &&
    (file.relativePath === undefined || typeof file.relativePath === 'string') &&
    (file.lastModified === undefined || typeof file.lastModified === 'number')
  );
}

/**
 * The sender's file list from earlier in this tab. A reload loses the files themselves (the browser cannot
 * hand them back), so this is what lets the page ask for exactly those files again.
 */
export function recallFileList(): ManifestFile[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SENDER_FILES_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRememberedFile).map(describeFile) : [];
  } catch (err) {
    console.warn('Could not read the remembered file list:', err);
    return [];
  }
}

export function rememberFileList(files: ManifestFile[]) {
  try {
    if (files.length === 0) {
      sessionStorage.removeItem(SENDER_FILES_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(SENDER_FILES_STORAGE_KEY, JSON.stringify(files.map(describeFile)));
  } catch (err) {
    // Storage can be unavailable (private mode, quota); a reload then just starts with an empty list
    console.warn('Could not remember the file list:', err);
  }
}
