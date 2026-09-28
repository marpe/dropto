import { useEffect, useReducer, useRef, useState } from 'react';
import type { AddFiles, AppSettings, IncomingFile, ManifestFile, TransferFile } from '../types/transfer';
import type { SharingOptions } from '../types/sharing';
import { fileIdentity, recallFileList, rememberFileList } from '../utils/fileMemory';
import { defaultSessionServices } from './sessionServices';
import type { FileHandleServices, SessionServices } from './sessionServices';
import { SenderRoom } from './senderRoom';
import { createInitialSenderState, selectFocusReceiver, selectSenderStatus, senderReducer } from './senderState';

export type { SenderSessionState } from './senderState';

export type SenderSession = ReturnType<typeof useSenderSession>;

function toIncoming(item: File | IncomingFile): IncomingFile {
  return item instanceof File ? { file: item } : item;
}

function toTransferFile({ file, relativePath }: IncomingFile): TransferFile {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    relativePath: relativePath ?? (file.webkitRelativePath || undefined),
    lastModified: file.lastModified,
    rawFile: file,
  };
}

/** A kept handle for a file listed before a reload */
interface KeptHandle {
  identity: string;
  relativePath?: string;
  handle: FileSystemFileHandle;
}

/** Reads kept handles back: the files that are there, and the handles that first need the user's OK. */
async function readKeptHandles(fileHandles: FileHandleServices, kept: KeptHandle[]) {
  const results = await Promise.all(kept.map(async (entry) => ({ entry, result: await fileHandles.read(entry.handle) })));
  return {
    ready: results.flatMap(({ entry, result }): IncomingFile[] =>
      result.status === 'ready' ? [{ file: result.file, relativePath: entry.relativePath, handle: entry.handle }] : []
    ),
    locked: results.flatMap(({ entry, result }) => (result.status === 'needs-permission' ? [entry] : [])),
  };
}

async function loadKeptHandles(fileHandles: FileHandleServices, files: ManifestFile[]): Promise<KeptHandle[]> {
  const handles = await fileHandles.store.load(files.map(fileIdentity));
  return files.flatMap((file) => {
    const handle = handles.get(fileIdentity(file));
    return handle ? [{ identity: fileIdentity(file), relativePath: file.relativePath, handle }] : [];
  });
}

interface UseSenderSessionOptions {
  /** A room is open only while active (i.e. the app is in send mode) */
  active: boolean;
  settings: AppSettings;
  services?: SessionServices;
}

export function useSenderSession({ active, settings, services = defaultSessionServices }: UseSenderSessionOptions) {
  // Files listed before a reload come back as missing, to be added again (or read back through kept handles)
  const [recalledFiles] = useState(recallFileList);
  const [state, dispatch] = useReducer(senderReducer, undefined, () => ({
    ...createInitialSenderState(),
    missingFiles: recalledFiles,
  }));
  // Kept handles the browser wants the user's OK for before they can be read again
  const [lockedHandles, setLockedHandles] = useState<KeptHandle[]>([]);
  const [room] = useState(
    () => new SenderRoom(services, dispatch, { files: state.files, options: state.options, isShared: state.isShared })
  );
  const settingsRef = useRef(settings);
  const focus = selectFocusReceiver(state);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    rememberFileList([...state.files, ...state.missingFiles]);
  }, [state.files, state.missingFiles]);

  // The room applies the sender's choices to everyone connected: re-offered files, admissions, free slots
  useEffect(() => {
    room.configure({ files: state.files, options: state.options, isShared: state.isShared });
  }, [room, state.files, state.options, state.isShared]);

  useEffect(() => {
    if (!active) {
      return;
    }
    room.open(settingsRef.current);
    return () => {
      room.close();
      dispatch({ type: 'ROOM_CLOSED' });
    };
  }, [active, room]);

  /** Duplicates and files coming back after a reload are sorted out by the reducer, which has the latest list. */
  const addFiles: AddFiles = (items) => {
    const incoming = items.map(toIncoming);
    if (incoming.length === 0) {
      return;
    }
    const files = incoming.map(toTransferFile);
    dispatch({ type: 'FILES_ADDED', files });
    const handles = incoming.flatMap((item, index): [string, FileSystemFileHandle][] =>
      item.handle ? [[fileIdentity(files[index]), item.handle]] : []
    );
    if (services.fileHandles && handles.length > 0) {
      void services.fileHandles.store.saveMany(handles);
    }
  };

  // After a reload, files whose handles were kept come back by themselves where the browser still allows it
  useEffect(() => {
    const fileHandles = services.fileHandles;
    if (!fileHandles || recalledFiles.length === 0) {
      return;
    }
    let isCurrent = true;
    void (async () => {
      const { ready, locked } = await readKeptHandles(fileHandles, await loadKeptHandles(fileHandles, recalledFiles));
      if (!isCurrent) {
        return;
      }
      dispatch({ type: 'FILES_ADDED', files: ready.map(toTransferFile) });
      setLockedHandles(locked);
    })();
    return () => {
      isCurrent = false;
    };
  }, [services.fileHandles, recalledFiles]);

  const missingIdentities = new Set(state.missingFiles.map(fileIdentity));
  // Only files still missing: one added again by hand (or removed) needs no access any more
  const restorable = lockedHandles.filter((entry) => missingIdentities.has(entry.identity));

  /** Asks the browser for access to the kept files again (inside the click), then reads back what it allows. */
  const restoreFiles = async () => {
    const fileHandles = services.fileHandles;
    if (!fileHandles || restorable.length === 0) {
      return;
    }
    // Read back whatever was allowed, even if the user declined some
    await fileHandles.requestAccess(restorable.map((entry) => entry.handle));
    const { ready, locked } = await readKeptHandles(fileHandles, restorable);
    dispatch({ type: 'FILES_ADDED', files: ready.map(toTransferFile) });
    setLockedHandles(locked);
  };

  const removeFile = (fileId: string) => {
    const file = [...state.files, ...state.missingFiles].find((candidate) => candidate.id === fileId);
    dispatch({ type: 'FILE_REMOVED', fileId });
    if (file && services.fileHandles) {
      void services.fileHandles.store.remove([fileIdentity(file)]);
    }
  };

  const forgetHandles = () => {
    setLockedHandles([]);
    void services.fileHandles?.store.clear();
  };

  const setSharingOptions = (options: Partial<SharingOptions>) => {
    dispatch({ type: 'OPTIONS_CHANGED', options });
  };

  /**
   * Changes the sharing options once the link is out. They are checked when someone connects, so
   * 'new' leaves current receivers alone; 'now' also stops everyone so they reconnect under the new rules.
   */
  const updateSharing = (options: SharingOptions, applyTo: 'new' | 'now') => {
    if (applyTo === 'now') {
      room.stopAll();
    }
    setSharingOptions(options);
  };

  /** Ends the share but keeps the files: the old link stops working and a new one can be created. */
  const stopSharing = () => {
    room.endShare();
    dispatch({ type: 'SHARE_ENDED' });
    room.open(settingsRef.current, { isFresh: true });
  };

  /** Back to an empty page: no files, no link, nobody connected. */
  const startOver = () => {
    room.endShare();
    dispatch({ type: 'FILES_CLEARED' });
    forgetHandles();
    // A new batch gets a new link: whoever had the old one must not be let into the next share
    if (state.isShared) {
      room.open(settingsRef.current, { isFresh: true });
    }
  };

  const clearFiles = () => {
    // Someone deciding where to save keeps their connection and just sees the list empty
    if (state.receivers.some((receiver) => receiver.stage === 'choosing')) {
      dispatch({ type: 'QUEUE_EMPTIED' });
      forgetHandles();
      return;
    }
    startOver();
  };

  return {
    state,
    status: selectSenderStatus(state),
    /** The only person on the link; null with nobody or several */
    focus,
    /** Missing files that one click (and the browser's OK) can read back */
    restorableCount: restorable.length,
    actions: {
      addFiles,
      removeFile,
      restoreFiles,
      clearFiles,
      startOver,
      setSharingOptions,
      createLink: () => {
        if (state.files.length > 0) {
          services.effects.onTransferRequested();
          dispatch({ type: 'LINK_CREATED' });
        }
      },
      updateSharing,
      stopSharing,
      approvePeer: (peerId: string) => room.approve(peerId),
      rejectPeer: (peerId: string) => room.reject(peerId),
      stopReceiver: (peerId: string) => room.stop(peerId),
      togglePauseReceiver: (peerId: string) => room.togglePause(peerId),
      dismissReceiver: (peerId: string) => dispatch({ type: 'RECEIVER_REMOVED', peerId }),
      retryRoom: () => room.open(settingsRef.current),
    },
  };
}
