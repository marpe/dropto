import type { ManifestFile } from '../types/transfer';

export interface StorageWriter {
  prepare(filename: string, size: number): Promise<boolean>;
  writeChunk(chunk: Uint8Array): Promise<void>;
  finalize(): Promise<void>;
  abort(): Promise<void>;
  isNativeFSA: boolean;
}

export type WriterFactory = (file: ManifestFile) => StorageWriter;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
};

/** Streams chunks straight to disk through a File System Access writable. */
abstract class NativeFileWriter implements StorageWriter {
  protected writableStream: FileSystemWritableFileStream | null = null;
  public isNativeFSA = true;

  public abstract prepare(filename: string, size: number): Promise<boolean>;

  public async writeChunk(chunk: Uint8Array): Promise<void> {
    if (!this.writableStream) {
      throw new Error('Writable stream not initialized');
    }
    await this.writableStream.write(chunk as unknown as BufferSource);
  }

  public async finalize(): Promise<void> {
    if (this.writableStream) {
      await this.writableStream.close();
      this.writableStream = null;
    }
  }

  public async abort(): Promise<void> {
    if (this.writableStream) {
      try {
        await this.writableStream.abort();
      } catch {
        // Stream already closed or errored; nothing left to clean up
      }
      this.writableStream = null;
    }
  }
}

export class FileSystemAccessWriter extends NativeFileWriter {
  public async prepare(filename: string, _size: number): Promise<boolean> {
    if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
      return false;
    }

    try {
      const pickerOptions: any = {
        suggestedName: filename,
      };

      const dotIndex = filename.lastIndexOf('.');
      if (dotIndex > 0) {
        const ext = filename.substring(dotIndex).toLowerCase();
        pickerOptions.types = [
          {
            description: 'File',
            accept: {
              'application/octet-stream': [ext],
            },
          },
        ];
      }

      const handle = await (window as any).showSaveFilePicker(pickerOptions);
      this.writableStream = await handle.createWritable();
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('User cancelled save file dialog');
        return false;
      }
      console.warn('Error opening FileSystemWritableFileStream, rethrowing for fallback:', err);
      throw err;
    }
  }
}

/** Writes a file inside a user-chosen folder, recreating the sender's relative path. */
export class DirectoryWriter extends NativeFileWriter {
  private readonly root: FileSystemDirectoryHandle;
  private readonly relativePath?: string;

  constructor(root: FileSystemDirectoryHandle, relativePath?: string) {
    super();
    this.root = root;
    this.relativePath = relativePath;
  }

  public async prepare(filename: string, _size: number): Promise<boolean> {
    const segments = toSafePathSegments(this.relativePath || filename);
    const fileName = segments.pop() ?? 'untitled';

    let directory = this.root;
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    const handle = await directory.getFileHandle(fileName, { create: true });
    this.writableStream = await handle.createWritable();
    return true;
  }
}

/** Splits a peer-supplied path, dropping empty, `.` and `..` segments so writes stay inside the chosen folder. */
function toSafePathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export class MemoryFallbackWriter implements StorageWriter {
  private chunks: BlobPart[] = [];
  private filename: string = '';
  public isNativeFSA = false;

  public async prepare(filename: string, _size: number): Promise<boolean> {
    this.filename = filename;
    this.chunks = [];
    return true;
  }

  public async writeChunk(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk as unknown as BlobPart);
  }

  public async finalize(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.chunks = [];
      return;
    }
    try {
      const blob = new Blob(this.chunks);
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (typeof URL.revokeObjectURL === 'function') {
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      }
    } catch (e) {
      // In testing environments or restricted sandboxes, createObjectURL may not be available
      console.warn('Memory download trigger warning:', e);
    } finally {
      this.chunks = [];
    }
  }

  public async abort(): Promise<void> {
    this.chunks = [];
  }
}

export class AutoStorageWriter implements StorageWriter {
  private activeWriter: StorageWriter;
  public isNativeFSA = true;

  constructor() {
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      this.activeWriter = new FileSystemAccessWriter();
      this.isNativeFSA = true;
    } else {
      this.activeWriter = new MemoryFallbackWriter();
      this.isNativeFSA = false;
    }
  }

  public async prepare(filename: string, size: number): Promise<boolean> {
    if (this.activeWriter.isNativeFSA) {
      try {
        const ok = await this.activeWriter.prepare(filename, size);
        return ok;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return false;
        }
        console.warn('File System Access API failed, falling back to memory download:', err);
        this.activeWriter = new MemoryFallbackWriter();
        this.isNativeFSA = false;
        return await this.activeWriter.prepare(filename, size);
      }
    }
    return await this.activeWriter.prepare(filename, size);
  }

  public async writeChunk(chunk: Uint8Array): Promise<void> {
    return this.activeWriter.writeChunk(chunk);
  }

  public async finalize(): Promise<void> {
    return this.activeWriter.finalize();
  }

  public async abort(): Promise<void> {
    return this.activeWriter.abort();
  }
}

export function createStorageWriter(): StorageWriter {
  return new AutoStorageWriter();
}

/**
 * Decides where incoming files go. Must be called from a user gesture: browsers only allow
 * file pickers during one, so a multi-file transfer picks a folder once up front instead of
 * opening a save dialog per file.
 * Returns null if the user cancels the picker.
 */
export async function chooseWriterFactory(files: ManifestFile[]): Promise<WriterFactory | null> {
  if (files.length <= 1) {
    return () => createStorageWriter();
  }

  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    return () => new MemoryFallbackWriter();
  }

  try {
    const root = await (window as DirectoryPickerWindow).showDirectoryPicker({ mode: 'readwrite' });
    return (file) => new DirectoryWriter(root, file.relativePath);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return null;
    }
    console.warn('Folder picker failed, falling back to in-memory downloads:', err);
    return () => new MemoryFallbackWriter();
  }
}
