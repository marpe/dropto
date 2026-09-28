import type { NamedFile } from '../types/transfer';

/** Where the file sits in what was shared: the folder-relative path, or just its name. */
export function displayPath(file: NamedFile): string {
  return file.relativePath || file.name;
}

// Longer "extensions" are usually part of the name ("notes.from-the-meeting")
const MAX_EXTENSION_LENGTH = 8;

/** "pdf" for "report.pdf"; empty for names without one, dotfiles (".env") and names ending in a dot. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) {
    return '';
  }
  const extension = name.slice(dot + 1);
  return extension.length <= MAX_EXTENSION_LENGTH ? extension.toLowerCase() : '';
}
