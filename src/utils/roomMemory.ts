export const SENDER_ROOM_STORAGE_KEY = 'sender-room';

export interface RememberedRoom {
  roomCode: string;
  shareKey: string;
  /** The link was handed out, so after a reload it is shown again and people holding it are expected */
  isShared: boolean;
}

/** The sender's room from earlier in this tab, so a reload keeps already-shared links working. */
export function recallRoom(): RememberedRoom | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SENDER_ROOM_STORAGE_KEY) ?? 'null');
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as RememberedRoom).roomCode === 'string' &&
      typeof (parsed as RememberedRoom).shareKey === 'string'
    ) {
      const room = parsed as RememberedRoom;
      return { roomCode: room.roomCode, shareKey: room.shareKey, isShared: room.isShared === true };
    }
  } catch (err) {
    console.warn('Could not read the remembered room:', err);
  }
  return null;
}

export function rememberRoom(room: RememberedRoom) {
  try {
    sessionStorage.setItem(SENDER_ROOM_STORAGE_KEY, JSON.stringify(room));
  } catch (err) {
    // Storage can be unavailable (private mode, quota); links then just don't survive a reload
    console.warn('Could not remember the room:', err);
  }
}
