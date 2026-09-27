// @env browser

/** Folder uploads identify files by `webkitRelativePath`; dropped entries need it set the same way. */
function withRelativePath(file: File, relativePath: string): File {
  // The native property is a read-only getter on File.prototype; an own property shadows it
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];
  // readEntries returns batches (about 100 at a time in Chromium) until it returns an empty one
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) {
      return entries;
    }
    entries.push(...batch);
  }
}

async function collectEntry(entry: FileSystemEntry, parentPath: string): Promise<File[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    return [parentPath ? withRelativePath(file, path) : file];
  }
  if (entry.isDirectory) {
    const children = await readDirectory(entry as FileSystemDirectoryEntry);
    const nested = await Promise.all(children.map((child) => collectEntry(child, path)));
    return nested.flat();
  }
  return [];
}

/**
 * Files from a drop, including everything inside dropped folders. `dataTransfer.files` alone lists a
 * dropped folder as one unreadable pseudo-file, so folders are walked through the entries API.
 * Entries must be taken synchronously inside the drop event; they are invalid once it returns.
 */
export function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => !!entry);
  if (entries.length === 0) {
    return Promise.resolve(Array.from(dataTransfer.files));
  }
  return Promise.all(entries.map((entry) => collectEntry(entry, ''))).then((nested) => nested.flat());
}
