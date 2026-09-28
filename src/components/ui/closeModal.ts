import { createContext, useContext } from 'react';

/** Closes the dialog with its exit animation, then calls `then` (by default the Modal's onClose) */
export type CloseModal = (then?: () => void) => void;

export const CloseModalContext = createContext<CloseModal>((then) => then?.());

/**
 * For a dialog's own actions: the parent unmounts the dialog, which would cut its exit animation, so an
 * action calls `close(onConfirm)` to run once the dialog has animated out (`close()` runs onClose).
 */
export const useCloseModal = () => useContext(CloseModalContext);
