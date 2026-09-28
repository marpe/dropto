import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HandleStore,
  handlesFromDrop,
  pickFilesWithHandles,
  pickFolderWithHandles,
  readHandle,
  requestReadAccess,
  supportsHandlePersistence,
  supportsOpenFilePicker,
} from '../utils/fileHandles';

/**
 * Just enough of IndexedDB for HandleStore: one connection per open(), requests succeed on a
 * microtask and transactions complete on the next macrotask, as in browsers.
 */
function createFakeIndexedDB() {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();
  let failTransactions = false;

  const request = (result?: unknown) => {
    const req: { result: unknown; onsuccess?: () => void } = { result };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };

  const makeDatabase = (stores: Map<string, Map<IDBValidKey, unknown>>) => ({
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => {
      stores.set(name, new Map());
    },
    transaction: (storeName: string) => {
      const store = stores.get(storeName);
      if (!store) {
        throw Object.assign(new Error(`No store ${storeName}`), { name: 'NotFoundError' });
      }
      const tx: {
        error: Error | null;
        oncomplete?: () => void;
        onerror?: () => void;
        onabort?: () => void;
        objectStore: () => unknown;
        abort: () => void;
      } = {
        error: null,
        objectStore: () => ({
          put: (value: unknown, key: IDBValidKey) => {
            store.set(key, value);
            return request(key);
          },
          get: (key: IDBValidKey) => request(store.get(key)),
          delete: (key: IDBValidKey) => {
            store.delete(key);
            return request();
          },
          clear: () => {
            store.clear();
            return request();
          },
        }),
        abort: () => {
          tx.onabort?.();
        },
      };
      const shouldFail = failTransactions;
      setTimeout(() => {
        if (shouldFail) {
          tx.error = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
          tx.onerror?.();
          tx.onabort?.();
        } else {
          tx.oncomplete?.();
        }
      }, 0);
      return tx;
    },
    close: vi.fn(),
    onversionchange: null as (() => void) | null,
  });

  const factory = {
    open: vi.fn((name: string) => {
      const req: {
        result?: unknown;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      setTimeout(() => {
        let stores = databases.get(name);
        const isNew = !stores;
        if (!stores) {
          stores = new Map();
          databases.set(name, stores);
        }
        req.result = makeDatabase(stores);
        if (isNew) {
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      }, 0);
      return req;
    }),
  };

  return {
    factory: factory as unknown as IDBFactory,
    open: factory.open,
    databases,
    failTransactions: (fail: boolean) => {
      failTransactions = fail;
    },
  };
}

function fakeFileHandle(name: string, overrides: Record<string, unknown> = {}) {
  const file = new File([name], name);
  return {
    kind: 'file',
    name,
    file,
    getFile: vi.fn().mockResolvedValue(file),
    ...overrides,
  } as unknown as FileSystemFileHandle & { file: File; getFile: ReturnType<typeof vi.fn> };
}

function fakeDirectory(name: string, children: unknown[]) {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* children;
    },
  };
}

const domError = (name: string) => Object.assign(new Error(name), { name });

function stubWindow(name: string, value: unknown) {
  Object.defineProperty(window, name, { value, configurable: true, writable: true });
}

afterEach(() => {
  for (const name of ['showOpenFilePicker', 'showDirectoryPicker']) {
    Reflect.deleteProperty(window, name);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('feature detection', () => {
  it('reports unsupported without the open picker', () => {
    expect(supportsOpenFilePicker()).toBe(false);
    expect(supportsHandlePersistence()).toBe(false);
  });

  it('needs both the open picker and IndexedDB for persistence', () => {
    stubWindow('showOpenFilePicker', vi.fn());
    vi.stubGlobal('indexedDB', undefined);
    expect(supportsOpenFilePicker()).toBe(true);
    expect(supportsHandlePersistence()).toBe(false);

    vi.stubGlobal('indexedDB', createFakeIndexedDB().factory);
    expect(supportsHandlePersistence()).toBe(true);
  });
});

describe('HandleStore', () => {
  let fake: ReturnType<typeof createFakeIndexedDB>;
  let store: HandleStore;

  beforeEach(() => {
    fake = createFakeIndexedDB();
    store = new HandleStore({ indexedDB: fake.factory, dbName: 'test-handles' });
  });

  it('round-trips handles through save, saveMany, load, remove and clear', async () => {
    const a = fakeFileHandle('a.txt');
    const b = fakeFileHandle('b.txt');
    const c = fakeFileHandle('c.txt');

    await store.save('a', a);
    await store.saveMany([
      ['b', b],
      ['c', c],
    ]);
    const loaded = await store.load(['a', 'b', 'c', 'missing']);
    expect([...loaded.keys()]).toEqual(['a', 'b', 'c']);
    expect(loaded.get('b')).toBe(b);

    await store.remove(['a', 'c']);
    expect([...(await store.load(['a', 'b', 'c'])).keys()]).toEqual(['b']);

    await store.clear();
    expect((await store.load(['b'])).size).toBe(0);
  });

  it('opens the database once and creates its store', async () => {
    await store.save('a', fakeFileHandle('a.txt'));
    await store.load(['a']);
    expect(fake.open).toHaveBeenCalledTimes(1);
    expect(fake.open).toHaveBeenCalledWith('test-handles', 1);
    expect(fake.databases.get('test-handles')?.has('handles')).toBe(true);
  });

  it('uses the default database name', async () => {
    await new HandleStore({ indexedDB: fake.factory }).clear();
    expect(fake.open).toHaveBeenCalledWith('dropwave-file-handles', 1);
  });

  it('resolves and warns when a transaction fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.save('a', fakeFileHandle('a.txt'));
    fake.failTransactions(true);

    await expect(store.save('b', fakeFileHandle('b.txt'))).resolves.toBeUndefined();
    await expect(store.load(['a'])).resolves.toEqual(new Map());
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('resolves and warns when IndexedDB is absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('indexedDB', undefined);
    const absent = new HandleStore();

    await expect(absent.save('a', fakeFileHandle('a.txt'))).resolves.toBeUndefined();
    await expect(absent.saveMany([['b', fakeFileHandle('b.txt')]])).resolves.toBeUndefined();
    await expect(absent.load(['a'])).resolves.toEqual(new Map());
    await expect(absent.remove(['a'])).resolves.toBeUndefined();
    await expect(absent.clear()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(5);
  });
});

describe('readHandle', () => {
  it('reads the file when permission is granted', async () => {
    const handle = fakeFileHandle('a.txt', { queryPermission: vi.fn().mockResolvedValue('granted') });
    expect(await readHandle(handle)).toEqual({ status: 'ready', file: handle.file });
  });

  it('needs permission when the browser would prompt, without reading', async () => {
    const handle = fakeFileHandle('a.txt', { queryPermission: vi.fn().mockResolvedValue('prompt') });
    expect(await readHandle(handle)).toEqual({ status: 'needs-permission' });
    expect(handle.getFile).not.toHaveBeenCalled();
  });

  it('is gone when permission is denied', async () => {
    const handle = fakeFileHandle('a.txt', { queryPermission: vi.fn().mockResolvedValue('denied') });
    expect(await readHandle(handle)).toEqual({ status: 'gone' });
  });

  it.each(['NotFoundError', 'NotReadableError'])('is gone when getFile throws %s', async (name) => {
    const handle = fakeFileHandle('a.txt', {
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockRejectedValue(domError(name)),
    });
    expect(await readHandle(handle)).toEqual({ status: 'gone' });
  });

  it('tries getFile directly without queryPermission', async () => {
    const handle = fakeFileHandle('a.txt');
    expect(await readHandle(handle)).toEqual({ status: 'ready', file: handle.file });
  });
});

describe('requestReadAccess', () => {
  it('asks for every handle not yet granted and succeeds when all are granted', async () => {
    const granted = fakeFileHandle('a.txt', {
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn(),
    });
    const promptA = fakeFileHandle('b.txt', {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    const promptB = fakeFileHandle('c.txt', {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });

    expect(await requestReadAccess([granted, promptA, promptB])).toBe(true);
    expect((granted as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).not.toHaveBeenCalled();
    for (const handle of [promptA, promptB]) {
      expect((handle as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).toHaveBeenCalledWith({
        mode: 'read',
      });
    }
  });

  it('fails without asking again after a refusal', async () => {
    const refused = fakeFileHandle('a.txt', { requestPermission: vi.fn().mockResolvedValue('denied') });
    const next = fakeFileHandle('b.txt', { requestPermission: vi.fn().mockResolvedValue('granted') });

    expect(await requestReadAccess([refused, next])).toBe(false);
    expect((next as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).not.toHaveBeenCalled();
  });

  it('fails when the request throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handle = fakeFileHandle('a.txt', { requestPermission: vi.fn().mockRejectedValue(domError('SecurityError')) });
    expect(await requestReadAccess([handle])).toBe(false);
  });
});

describe('pickFilesWithHandles', () => {
  it('returns the picked files with their handles', async () => {
    const a = fakeFileHandle('a.txt');
    const picker = vi.fn().mockResolvedValue([a]);
    stubWindow('showOpenFilePicker', picker);

    expect(await pickFilesWithHandles()).toEqual([{ file: a.file, handle: a }]);
    expect(picker).toHaveBeenCalledWith({ multiple: true });
  });

  it('returns nothing when the user cancels', async () => {
    stubWindow('showOpenFilePicker', vi.fn().mockRejectedValue(domError('AbortError')));
    expect(await pickFilesWithHandles()).toEqual([]);
  });

  it('rethrows other errors', async () => {
    stubWindow('showOpenFilePicker', vi.fn().mockRejectedValue(domError('SecurityError')));
    await expect(pickFilesWithHandles()).rejects.toThrow('SecurityError');
  });
});

describe('pickFolderWithHandles', () => {
  it('walks the folder with paths that include the root name', async () => {
    const top = fakeFileHandle('top.txt');
    const deep = fakeFileHandle('deep.txt');
    const inner = fakeFileHandle('inner.txt');
    const root = fakeDirectory('photos', [top, fakeDirectory('2024', [inner, fakeDirectory('june', [deep])])]);
    const picker = vi.fn().mockResolvedValue(root);
    stubWindow('showDirectoryPicker', picker);

    const picked = await pickFolderWithHandles();

    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(picked.map((p) => p.relativePath)).toEqual(['photos/top.txt', 'photos/2024/inner.txt', 'photos/2024/june/deep.txt']);
    expect(picked[2]).toEqual({ file: deep.file, handle: deep, relativePath: 'photos/2024/june/deep.txt' });
  });

  it('returns nothing when the user cancels', async () => {
    stubWindow('showDirectoryPicker', vi.fn().mockRejectedValue(domError('AbortError')));
    expect(await pickFolderWithHandles()).toEqual([]);
  });
});

describe('handlesFromDrop', () => {
  it('asks for every handle before awaiting any, with null where there is none', async () => {
    const handleA = fakeFileHandle('a.txt');
    const handleC = fakeFileHandle('c.txt');
    let releaseA: (handle: FileSystemHandle) => void = () => {};
    const itemA = {
      kind: 'file',
      getAsFileSystemHandle: vi.fn(() => new Promise<FileSystemHandle>((resolve) => (releaseA = resolve))),
    };
    const itemWithout = { kind: 'file' };
    const itemText = { kind: 'string', getAsFileSystemHandle: vi.fn() };
    const itemC = { kind: 'file', getAsFileSystemHandle: vi.fn().mockResolvedValue(handleC) };
    const itemNull = { kind: 'file', getAsFileSystemHandle: vi.fn().mockResolvedValue(null) };
    const itemRejects = { kind: 'file', getAsFileSystemHandle: vi.fn().mockRejectedValue(domError('NotAllowedError')) };
    const items = [itemA, itemWithout, itemText, itemC, itemNull, itemRejects];
    const list = Object.assign([...items], { length: items.length }) as unknown as DataTransferItemList;

    const result = handlesFromDrop(list);

    // Synchronous: the DataTransfer is emptied once the drop event returns
    expect(itemA.getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    expect(itemC.getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    expect(itemNull.getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    expect(itemRejects.getAsFileSystemHandle).toHaveBeenCalledTimes(1);
    expect(itemText.getAsFileSystemHandle).not.toHaveBeenCalled();

    releaseA(handleA);
    expect(await result).toEqual([handleA, null, handleC, null, null]);
  });
});
