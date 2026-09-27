import type { NamedFile } from '../types/transfer';

/** Where the file sits in what was shared: the folder-relative path, or just its name. */
export function displayPath(file: NamedFile): string {
  return file.relativePath || file.name;
}
