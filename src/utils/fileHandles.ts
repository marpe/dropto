// @env browser
import { isAbortError } from './errors';
import { fileSystemAccess } from './fileSystemAccess';

/**
 * Lets the sender's picked files survive a reload on Chromium: File System Access handles are
 * structured-cloneable, so they can sit in IndexedDB and be read again once permission is back.
 * Firefox and Safari have no open picker, so callers check `supportsHandlePersistence()` first.
 */

export interface PickedFile {
  file: File;
  handle: FileSystemFileHandle;
  /** `"<rootName>/<sub>/<name>"`, the same shape as `File.webkitRelativePath` from a folder input. */
  relativePath?: string;
}

export type HandleReadResult = { status: 'ready'; file: File } | { status: 'needs-permission' } | { status: 'gone' };

interface HandlePermissionDescriptor {
  mode: 'read' | 'readwrite';
}

/** Permission methods are Chromium only and not in lib.dom yet. */
interface PermissionedHandle {
  queryPermission?(descriptor: HandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor: HandlePermissionDescriptor): Promise<PermissionState>;
}

type OpenFilePickerWindow = Window & {
  showOpenFilePicker(options?: { multiple?: boolean }): Promise<FileSystemFileHandle[]>;
};

/** Async iteration of directories needs the DOM.AsyncIterable lib, which this project does not load. */
interface IterableDirectoryHandle {
  values(): AsyncIterable<FileSystemHandle>;
}

type HandleDataTransferItem = DataTransferItem & {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
};

const READ: HandlePermissionDescriptor = { mode: 'read' };

export function supportsOpenFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

export function supportsHandlePersistence(): boolean {
  return supportsOpenFilePicker() && getIndexedDB() !== undefined;
}

/** Must run inside a user click. Resolves to `[]` when the user closes the picker. */
export async function pickFilesWithHandles(): Promise<PickedFile[]> {
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as OpenFilePickerWindow).showOpenFilePicker({ multiple: true });
  } catch (err) {
    if (isAbortError(err)) {
      return [];
    }
    throw err;
  }
  return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
}

/** Must run inside a user click. Resolves to `[]` when the user closes the picker. */
export async function pickFolderWithHandles(): Promise<PickedFile[]> {
  let root: FileSystemDirectoryHandle;
  try {
    root = await fileSystemAccess().showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    if (isAbortError(err)) {
      return [];
    }
    throw err;
  }
  const files: PickedFile[] = [];
  await collectFiles(root, root.name, files);
  return files;
}

async function collectFiles(dir: FileSystemDirectoryHandle, path: string, out: PickedFile[]): Promise<void> {
  for await (const entry of (dir as unknown as IterableDirectoryHandle).values()) {
    const entryPath = `${path}/${entry.name}`;
    if (entry.kind === 'file') {
      const handle = entry as FileSystemFileHandle;
      out.push({ file: await handle.getFile(), handle, relativePath: entryPath });
    } else {
      await collectFiles(entry as FileSystemDirectoryHandle, entryPath, out);
    }
  }
}

/**
 * Handles for the dropped files, in order, with null where the browser gives none (anything but
 * Chromium, or a dropped item that is not on disk).
 *
 * Call this from the drop handler itself, before any await: the DataTransfer is emptied once the
 * event returns, so every `getAsFileSystemHandle()` call has to be made synchronously up front and
 * only the resulting promises awaited.
 */
export function handlesFromDrop(items: DataTransferItemList): Promise<(FileSystemHandle | null)[]> {
  const pending: Promise<FileSystemHandle | null>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as HandleDataTransferItem;
    if (item.kind !== 'file') {
      continue;
    }
    const handle = item.getAsFileSystemHandle?.();
    pending.push(handle ? handle.catch(() => null) : Promise.resolve(null));
  }
  return Promise.all(pending);
}

/** Reads a stored handle back without prompting, which only a click may do. */
export async function readHandle(handle: FileSystemFileHandle): Promise<HandleReadResult> {
  const permissioned = handle as FileSystemFileHandle & PermissionedHandle;
  if (permissioned.queryPermission) {
    let state: PermissionState;
    try {
      state = await permissioned.queryPermission(READ);
    } catch {
      return { status: 'gone' };
    }
    if (state === 'prompt') {
      return { status: 'needs-permission' };
    }
    if (state === 'denied') {
      return { status: 'gone' };
    }
  }
  try {
    return { status: 'ready', file: await handle.getFile() };
  } catch (err) {
    // Without queryPermission the only sign of a missing grant is getFile refusing
    if (errorName(err) === 'NotAllowedError') {
      return { status: 'needs-permission' };
    }
    // NotFoundError (moved or deleted) and NotReadableError (changed on disk) mean the file is lost
    return { status: 'gone' };
  }
}

/**
 * Must run inside a user click. Returns true only if every handle may be read. Stops at the first
 * refusal so a user who said no is not asked again for each remaining file.
 */
export async function requestReadAccess(handles: FileSystemFileHandle[]): Promise<boolean> {
  for (const handle of handles) {
    const permissioned = handle as FileSystemFileHandle & PermissionedHandle;
    // Nothing to ask for; readHandle finds out from getFile whether reading works
    if (!permissioned.requestPermission) {
      continue;
    }
    try {
      // Skipping handles that are already granted avoids spending the click on needless prompts
      if ((await permissioned.queryPermission?.(READ)) === 'granted') {
        continue;
      }
      if ((await permissioned.requestPermission(READ)) !== 'granted') {
        return false;
      }
    } catch (err) {
      // SecurityError when the click's user activation has run out
      console.warn('Could not request file access', err);
      return false;
    }
  }
  return true;
}

function errorName(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const { name } = err as { name?: unknown };
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

function getIndexedDB(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    // Some private modes throw on access instead of leaving it undefined
    return undefined;
  }
}

const DEFAULT_DB_NAME = 'dropwave-file-handles';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

export interface HandleStoreOptions {
  dbName?: string;
  /** Injected in tests; defaults to the global `indexedDB`. */
  indexedDB?: IDBFactory;
}

/**
 * File handles keyed by file id. Persistence is best-effort: every method resolves, and failures
 * (no IndexedDB, private mode, quota) only log a warning, leaving the files to be picked again.
 */
export class HandleStore {
  private readonly dbName: string;
  private readonly factory: IDBFactory | undefined;
  private db: Promise<IDBDatabase> | null = null;

  constructor(options: HandleStoreOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.factory = options.indexedDB ?? getIndexedDB();
  }

  save(fileId: string, handle: FileSystemFileHandle): Promise<void> {
    return this.saveMany([[fileId, handle]]);
  }

  async saveMany(entries: [string, FileSystemFileHandle][]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.run('readwrite', 'save', (store) => {
      for (const [fileId, handle] of entries) {
        store.put(handle, fileId);
      }
    });
  }

  async load(fileIds: string[]): Promise<Map<string, FileSystemFileHandle>> {
    const found = new Map<string, FileSystemFileHandle>();
    if (fileIds.length === 0) {
      return found;
    }
    const ok = await this.run('readonly', 'load', (store) => {
      for (const fileId of fileIds) {
        const request = store.get(fileId);
        request.onsuccess = () => {
          if (request.result) {
            found.set(fileId, request.result as FileSystemFileHandle);
          }
        };
      }
    });
    return ok ? found : new Map();
  }

  async remove(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) {
      return;
    }
    await this.run('readwrite', 'remove', (store) => {
      for (const fileId of fileIds) {
        store.delete(fileId);
      }
    });
  }

  async clear(): Promise<void> {
    await this.run('readwrite', 'clear', (store) => {
      store.clear();
    });
  }

  /** Runs one transaction; resolves to whether it committed. */
  private async run(mode: IDBTransactionMode, action: string, fill: (store: IDBObjectStore) => void): Promise<boolean> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
        try {
          fill(tx.objectStore(STORE_NAME));
        } catch (err) {
          // A failed request (a handle that cannot be cloned) does not abort by itself; keep it all-or-nothing
          tx.abort();
          reject(err);
        }
      });
      return true;
    } catch (err) {
      console.warn(`Could not ${action} file handles`, err);
      return false;
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      // A failed open is forgotten so a later call can try again
      this.db = this.openDatabase().catch((err: unknown) => {
        this.db = null;
        throw err;
      });
    }
    return this.db;
  }

  private openDatabase(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory) {
      return Promise.reject(new Error('IndexedDB is unavailable'));
    }
    return new Promise((resolve, reject) => {
      const request = factory.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database must not be blocked by this connection
        db.onversionchange = () => {
          db.close();
          this.db = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
