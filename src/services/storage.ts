export interface StorageWriter {
  prepare(filename: string, size: number): Promise<boolean>;
  writeChunk(chunk: Uint8Array): Promise<void>;
  finalize(): Promise<void>;
  abort(): Promise<void>;
  isNativeFSA: boolean;
}

export class FileSystemAccessWriter implements StorageWriter {
  private writableStream: FileSystemWritableFileStream | null = null;
  public isNativeFSA = true;

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
      } catch (e) {
        // ignore
      }
      this.writableStream = null;
    }
  }
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
