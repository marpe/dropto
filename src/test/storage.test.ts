import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AutoStorageWriter,
  MemoryFallbackWriter,
  FileSystemAccessWriter,
  chooseWriterFactory,
} from '../services/storage';
import type { ManifestFile } from '../types/transfer';
import { clearFilePickers, createMockDirectoryTree } from './utils/mockFileSystem';

function manifestFile(name: string, relativePath?: string): ManifestFile {
  return {
    id: name,
    name,
    size: 1024,
    type: 'application/octet-stream',
    relativePath,
    chunkSize: 64 * 1024,
    totalChunks: 1,
  };
}

describe('Storage Writers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearFilePickers();
  });

  describe('MemoryFallbackWriter', () => {
    it('initializes and buffers chunks successfully', async () => {
      const writer = new MemoryFallbackWriter();
      const ready = await writer.prepare('sample.txt', 100);
      expect(ready).toBe(true);

      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5, 6]);
      await writer.writeChunk(chunk1);
      await writer.writeChunk(chunk2);

      // Verify no throw on finalize
      await expect(writer.finalize()).resolves.not.toThrow();
    });
  });

  describe('FileSystemAccessWriter', () => {
    it('calls showSaveFilePicker with valid options and writes chunks', async () => {
      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined),
      };
      const mockHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      };

      (window as any).showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);

      const writer = new FileSystemAccessWriter();
      const ready = await writer.prepare('video.mp4', 1024);
      expect(ready).toBe(true);

      expect((window as any).showSaveFilePicker).toHaveBeenCalledWith(
        expect.objectContaining({
          suggestedName: 'video.mp4',
        })
      );

      const chunk = new Uint8Array([10, 20, 30]);
      await writer.writeChunk(chunk);
      expect(mockWritable.write).toHaveBeenCalledWith(chunk);

      await writer.finalize();
      expect(mockWritable.close).toHaveBeenCalled();
    });

    it('returns false when user cancels showSaveFilePicker (AbortError)', async () => {
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      (window as any).showSaveFilePicker = vi.fn().mockRejectedValue(abortError);

      const writer = new FileSystemAccessWriter();
      const ready = await writer.prepare('archive.zip', 2048);
      expect(ready).toBe(false);
    });
  });

  describe('AutoStorageWriter', () => {
    it('gracefully degrades to MemoryFallbackWriter if FileSystemAccess throws an error', async () => {
      (window as any).showSaveFilePicker = vi.fn().mockRejectedValue(new Error('SecurityError: prohibited'));

      const autoWriter = new AutoStorageWriter();
      const ready = await autoWriter.prepare('fallback.bin', 5000);
      expect(ready).toBe(true);
      expect(autoWriter.isNativeFSA).toBe(false);

      const chunk = new Uint8Array([1, 2]);
      await expect(autoWriter.writeChunk(chunk)).resolves.not.toThrow();
      await expect(autoWriter.finalize()).resolves.not.toThrow();
    });
  });
});

describe('chooseWriterFactory', () => {
  afterEach(() => {
    clearFilePickers();
  });

  it('asks for a folder once and writes every file into it, keeping relative paths', async () => {
    const { root, createdFiles, writables } = createMockDirectoryTree();
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(root);
    (window as any).showSaveFilePicker = vi.fn();
    const files = [
      manifestFile('a.jpg', 'photos/a.jpg'),
      manifestFile('b.jpg', 'photos/sub/b.jpg'),
      manifestFile('notes.txt'),
    ];

    const createWriter = await chooseWriterFactory(files);
    for (const file of files) {
      const writer = createWriter!(file);
      expect(await writer.prepare(file.name, file.size)).toBe(true);
      await writer.writeChunk(new Uint8Array([7]));
      await writer.finalize();
    }

    expect((window as any).showDirectoryPicker).toHaveBeenCalledTimes(1);
    expect((window as any).showSaveFilePicker).not.toHaveBeenCalled();
    expect(createdFiles).toEqual(['photos/a.jpg', 'photos/sub/b.jpg', 'notes.txt']);
    expect(writables['photos/sub/b.jpg'].write).toHaveBeenCalledWith(new Uint8Array([7]));
    expect(writables['photos/sub/b.jpg'].close).toHaveBeenCalled();
  });

  it('strips parent-directory segments from peer-supplied paths', async () => {
    const { root, createdFiles } = createMockDirectoryTree();
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(root);
    const files = [manifestFile('evil.txt', '../../etc/./evil.txt'), manifestFile('b.txt', '..\\b.txt')];

    const createWriter = await chooseWriterFactory(files);
    for (const file of files) {
      await createWriter!(file).prepare(file.name, file.size);
    }

    expect(createdFiles).toEqual(['etc/evil.txt', 'b.txt']);
  });

  it('returns null when the user cancels the folder picker', async () => {
    const abortError = Object.assign(new Error('User cancelled'), { name: 'AbortError' });
    (window as any).showDirectoryPicker = vi.fn().mockRejectedValue(abortError);

    const createWriter = await chooseWriterFactory([manifestFile('a.bin'), manifestFile('b.bin')]);

    expect(createWriter).toBeNull();
  });

  it('uses the save-file dialog instead of a folder for a single file', async () => {
    const { root } = createMockDirectoryTree();
    (window as any).showDirectoryPicker = vi.fn().mockResolvedValue(root);
    const writable = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    (window as any).showSaveFilePicker = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue(writable),
    });
    const file = manifestFile('movie.mkv');

    const createWriter = await chooseWriterFactory([file]);
    await createWriter!(file).prepare(file.name, file.size);

    expect((window as any).showDirectoryPicker).not.toHaveBeenCalled();
    expect((window as any).showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'movie.mkv' })
    );
  });

  it('falls back to in-memory downloads when folder picking is unsupported', async () => {
    const files = [manifestFile('a.bin'), manifestFile('b.bin')];

    const createWriter = await chooseWriterFactory(files);
    const writer = createWriter!(files[1]);

    expect(await writer.prepare('b.bin', 1024)).toBe(true);
    expect(writer.isNativeFSA).toBe(false);
  });
});
