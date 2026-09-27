import { vi } from 'vitest';

export interface MockWritable {
  write: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

/**
 * In-memory stand-in for a FileSystemDirectoryHandle tree. Mirrors the real API's
 * requirement that missing entries are only created when `{ create: true }` is passed.
 */
export function createMockDirectoryTree() {
  const createdFiles: string[] = [];
  const writables: Record<string, MockWritable> = {};

  const notFound = () => Object.assign(new Error('Entry not found'), { name: 'NotFoundError' });

  const makeDirectory = (path: string): any => ({
    kind: 'directory',
    name: path.split('/').filter(Boolean).pop() ?? '',
    getDirectoryHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!options?.create) {
        throw notFound();
      }
      return makeDirectory(`${path}${name}/`);
    }),
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!options?.create) {
        throw notFound();
      }
      const fullPath = `${path}${name}`;
      const writable: MockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined),
      };
      createdFiles.push(fullPath);
      writables[fullPath] = writable;
      return {
        kind: 'file',
        name,
        createWritable: vi.fn().mockResolvedValue(writable),
      };
    }),
  });

  return { root: makeDirectory(''), createdFiles, writables };
}

export function clearFilePickers() {
  delete (window as any).showSaveFilePicker;
  delete (window as any).showDirectoryPicker;
}
