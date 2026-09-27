import { useEffect, useReducer, useRef, useState } from 'react';
import type { AppSettings, TransferFile } from '../types/transfer';
import type { SharingOptions } from '../types/sharing';
import { displayPath } from '../utils/filePath';
import { rememberMaxSimultaneous } from '../utils/sharingMemory';
import { defaultSessionServices } from './sessionServices';
import type { SessionServices } from './sessionServices';
import { SenderRoom } from './senderRoom';
import { createInitialSenderState, selectFocusReceiver, selectSenderStatus, senderReducer } from './senderState';

export type { SenderSessionState } from './senderState';

export type SenderSession = ReturnType<typeof useSenderSession>;

function toTransferFile(file: File): TransferFile {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    relativePath: file.webkitRelativePath || undefined,
    lastModified: file.lastModified,
    rawFile: file,
  };
}

/** Same path, size and modification time: the same file picked or dropped twice. */
function fileIdentity(file: TransferFile): string {
  return `${displayPath(file)}|${file.size}|${file.lastModified}`;
}

interface UseSenderSessionOptions {
  /** A room is open only while active (i.e. the app is in send mode) */
  active: boolean;
  settings: AppSettings;
  services?: SessionServices;
}

export function useSenderSession({ active, settings, services = defaultSessionServices }: UseSenderSessionOptions) {
  const [state, dispatch] = useReducer(senderReducer, undefined, createInitialSenderState);
  const [room] = useState(
    () => new SenderRoom(services, dispatch, { files: state.files, options: state.options, isShared: state.isShared })
  );
  const settingsRef = useRef(settings);
  const focus = selectFocusReceiver(state);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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

  const addFiles = (rawFiles: File[]) => {
    const known = new Set(state.files.map(fileIdentity));
    const added = rawFiles.map(toTransferFile).filter((file) => {
      const identity = fileIdentity(file);
      if (known.has(identity)) {
        return false;
      }
      known.add(identity);
      return true;
    });
    if (added.length > 0) {
      dispatch({ type: 'FILES_ADDED', files: added });
    }
  };

  const setSharingOptions = (options: Partial<SharingOptions>) => {
    if (options.maxSimultaneous !== undefined) {
      rememberMaxSimultaneous(options.maxSimultaneous);
    }
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

  const clearFiles = () => {
    // Someone deciding where to save keeps their connection and just sees the list empty
    if (focus?.stage === 'choosing') {
      dispatch({ type: 'QUEUE_EMPTIED' });
      return;
    }
    room.endShare();
    dispatch({ type: 'FILES_CLEARED' });
    // A new batch gets a new link: whoever had the old one must not be let into the next share
    if (state.isShared) {
      room.open(settingsRef.current, { isFresh: true });
    }
  };

  return {
    state,
    status: selectSenderStatus(state),
    /** The one receiver a one-person share is about; null when sharing with several people */
    focus,
    actions: {
      addFiles,
      removeFile: (fileId: string) => dispatch({ type: 'FILE_REMOVED', fileId }),
      clearFiles,
      setSharingOptions,
      createLink: () => {
        if (state.files.length > 0) {
          dispatch({ type: 'LINK_CREATED' });
        }
      },
      updateSharing,
      stopSharing,
      approvePeer: (peerId: string) => room.approve(peerId),
      rejectPeer: (peerId: string) => room.reject(peerId),
      togglePause: () => {
        if (focus) {
          room.togglePause(focus.peerId);
        }
      },
      /** Stops the focused receiver's transfer (one-person share) */
      cancel: () => {
        if (focus) {
          room.stop(focus.peerId);
        }
      },
      stopReceiver: (peerId: string) => room.stop(peerId),
      dismissReceiver: (peerId: string) => dispatch({ type: 'RECEIVER_REMOVED', peerId }),
      dismissError: () => dispatch({ type: 'FINISHED_CLEARED' }),
      retryRoom: () => room.open(settingsRef.current),
    },
  };
}
