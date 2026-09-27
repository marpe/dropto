import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoStorageWriter, MemoryFallbackWriter, FileSystemAccessWriter } from '../services/storage';

describe('Storage Writers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
