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
    try {
      if (!('showSaveFilePicker' in window)) {
        return false;
      }

      // Prompt user to pick save location
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'All Files',
            accept: { '*/*': [] },
          },
        ],
      });

      this.writableStream = await handle.createWritable();
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('User cancelled save file dialog');
        return false;
      }
      console.warn('Error opening FileSystemWritableFileStream:', err);
      return false;
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
    const blob = new Blob(this.chunks);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.chunks = [];
  }

  public async abort(): Promise<void> {
    this.chunks = [];
  }
}

export function createStorageWriter(): StorageWriter {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    return new FileSystemAccessWriter();
  }
  return new MemoryFallbackWriter();
}
